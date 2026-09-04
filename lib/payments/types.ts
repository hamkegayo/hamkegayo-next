/**
 * 결제 게이트웨이 추상화 — PG 중립 인터페이스.
 *
 *  #49 가 payments 스키마를 PG 중립 명칭으로 잡아둔 것과 같은 이유다.
 *  공급사를 바꿀 때 이 인터페이스를 구현한 어댑터만 새로 쓰고
 *  승인 라우트(app/api/payments/*)는 건드리지 않는다.
 *
 *  금액 단위는 전부 원(정수)이다.
 */

/** 거래 상태 — payments.status 로 그대로 옮겨 쓸 수 있는 중립 표현 */
export type GatewayStatus =
    | "PAID" // 승인 완료
    | "READY" // 승인 전(가상계좌 발급 등)
    | "FAILED" // 승인 실패
    | "CANCELLED" // 전액 취소
    | "PARTIAL_CANCELLED" // 부분 취소
    | "EXPIRED"; // 만료

/** 승인·조회 결과 */
export type GatewayPayment = {
    /** PG 거래번호 → payments.transaction_id */
    transactionId: string;
    /** 가맹점 주문번호 → payments.order_id */
    orderId: string;
    /** 실제 승인된 금액 */
    amount: number;
    status: GatewayStatus;
    /** 승인 시각(ISO 8601). 미승인이면 null */
    paidAt: string | null;
    /** 매출전표 URL — 마이페이지 영수증 링크로 쓴다 */
    receiptUrl: string | null;
    /** 취소 가능 잔액. 조회·취소 응답에만 있다 */
    balanceAmount: number | null;
    /** 원본 응답 → payments.raw_response */
    raw: unknown;
};

/** 결제창 인증 결과 — returnUrl 로 POST 되는 값 */
export type GatewayAuthResult = {
    /** 성공 여부. 실패면 승인 API 를 호출하지 않는다 */
    ok: boolean;
    code: string;
    message: string;
    transactionId: string | null;
    orderId: string | null;
    /** 결제창이 돌려준 금액. **이 값을 신뢰하지 않는다** — 서버 재계산과 대조용이다 */
    amount: number | null;
    /** 위변조 검증용 */
    authToken: string | null;
    signature: string | null;
};

export type CancelParams = {
    transactionId: string;
    orderId: string;
    reason: string;
    /** 생략 시 전액 취소 */
    amount?: number;
};

/**
 * PG 어댑터.
 *
 *  구현체는 **서버에서만** 인스턴스화한다. 시크릿 키를 들고 있으므로
 *  클라이언트 컴포넌트에서 import 하면 번들에 키가 박힌다.
 */
export interface PaymentGateway {
    /**
     * 결제창 인증 결과의 위변조 여부를 검증한다.
     * 승인 API 를 부르기 **전에** 반드시 통과시킨다.
     */
    verifyAuthResult(auth: GatewayAuthResult): boolean;

    /** 승인. 인증만으로는 돈이 빠지지 않으며 이 호출이 실제 청구다. */
    approve(params: {
        transactionId: string;
        amount: number;
    }): Promise<GatewayPayment>;

    /** 거래 조회 — 승인 타임아웃 시 실제 상태를 확인하는 용도 */
    find(params: {
        transactionId?: string;
        orderId?: string;
    }): Promise<GatewayPayment>;

    /** 취소·부분취소 */
    cancel(params: CancelParams): Promise<GatewayPayment>;

    /**
     * 망취소 — 승인 요청은 나갔는데 응답을 못 받은 경우에만 쓴다.
     * 유효기간 1시간. 일반 취소와 용도가 다르니 혼용하지 않는다.
     */
    netCancel(params: { orderId: string }): Promise<GatewayPayment>;
}

/** PG 호출 실패. code 는 공급사 결과코드를 그대로 담는다. */
export class PaymentGatewayError extends Error {
    constructor(
        message: string,
        readonly code: string,
        readonly raw: unknown = null,
        /**
         * 승인 요청이 나갔는지 불확실한 상태(타임아웃·네트워크 오류).
         * true 면 재시도 대신 **조회 또는 망취소**로 정리해야 한다.
         */
        readonly indeterminate = false,
    ) {
        super(message);
        this.name = "PaymentGatewayError";
    }
}

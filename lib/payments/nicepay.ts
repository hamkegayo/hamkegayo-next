import { createHash } from "node:crypto";

import {
    PaymentGatewayError,
    type CancelParams,
    type GatewayAuthResult,
    type GatewayPayment,
    type GatewayStatus,
    type PaymentGateway,
} from "./types";

/**
 * 나이스페이먼츠 신형 API(v1) 어댑터.
 *
 *  문서 : https://github.com/nicepayments/nicepay-manual
 *
 *  흐름은 **인증 → 승인** 2단이다. 결제창에서 인증이 끝나면 returnUrl 로
 *  결과가 POST 되는데, 이 시점에는 아직 돈이 빠지지 않는다.
 *  서버가 signature 를 검증하고 금액을 재계산해 대조한 뒤 승인 API 를 불러야
 *  실제 청구가 일어난다.
 *
 *  ⚠️ 이 파일은 시크릿 키를 읽는다. 클라이언트 컴포넌트에서 import 하지 말 것.
 */

/**
 * 승인 API 읽기 타임아웃. 초과 시 재시도가 아니라 조회·망취소로 정리한다.
 *
 *  ⚠️ **서버리스 함수 실행 제한보다 짧아야 한다.** 20초였을 때는 Vercel Hobby
 *     의 10초 제한이 먼저 걸려 함수가 통째로 죽었다 — 그러면 이 타임아웃이
 *     아예 발화하지 않아 아래의 망취소·사고기록 경로가 **한 번도 실행되지
 *     않는다.** 돈은 빠지고 아무 기록도 남지 않는 상태가 된다.
 *
 *  10초 안에 승인·복구·DB 확정이 모두 끝나도록 나눈 예산이다.
 *    승인 5초 + 복구(망취소/조회) 3초 + DB·직렬화 ≈ 1초 = 9초
 *
 *  Fluid Compute(제한 300초)에서도 이 값이면 충분하다 — NICEPAY 승인은
 *  정상 응답이 1~3초다. 넉넉하게 잡아 얻는 것이 없다.
 */
const APPROVE_TIMEOUT_MS = 5_000;

/**
 * 복구 호출(망취소·조회·취소) 타임아웃.
 *
 *  승인이 이미 5초를 쓴 뒤에 도는 경로다. 여기서 또 길게 기다리면 복구
 *  도중에 함수가 잘려 사고 기록이 남지 않는다. 짧게 끊고 실패로 넘긴다 —
 *  망취소가 실패해도 사고 원장에는 남는다.
 */
const RECOVERY_TIMEOUT_MS = 3_000;

/** 나이스페이 성공 결과코드 */
const RESULT_OK = "0000";

type NicepayResponse = {
    resultCode?: string;
    resultMsg?: string;
    tid?: string;
    orderId?: string;
    amount?: number;
    balanceAmt?: number;
    status?: string;
    paidAt?: string;
    receiptUrl?: string;
    cancelledTid?: string;
};

/**
 * 나이스페이 status → 중립 상태.
 * 문서상 값은 paid / ready / failed / cancelled / partialCancelled / expired 다.
 */
function toGatewayStatus(status: string | undefined): GatewayStatus {
    switch (status) {
        case "paid":
            return "PAID";
        case "ready":
            return "READY";
        case "cancelled":
            return "CANCELLED";
        case "partialCancelled":
            return "PARTIAL_CANCELLED";
        case "expired":
            return "EXPIRED";
        default:
            return "FAILED";
    }
}

/** 나이스페이는 "0001-01-01T00:00:00.000+0900" 을 미승인 표시로 돌려준다 */
function toPaidAt(paidAt: string | undefined): string | null {
    if (!paidAt || paidAt.startsWith("0001-01-01")) return null;
    return paidAt;
}

function sha256Hex(input: string): string {
    return createHash("sha256").update(input, "utf8").digest("hex");
}

class NicepayGateway implements PaymentGateway {
    /** Basic 인증 자격증명 — Base64(clientKey:secretKey) */
    private readonly credentials: string;

    constructor(
        private readonly clientKey: string,
        private readonly secretKey: string,
        private readonly apiBase: string,
    ) {
        this.credentials = Buffer.from(
            `${clientKey}:${secretKey}`,
            "utf8",
        ).toString("base64");
    }

    /**
     * signature = hex(sha256(authToken + clientId + amount + secretKey))
     *
     * 결제창이 돌려준 금액이 위변조되지 않았음을 확인한다. 다만 이것만으로는
     * "우리가 청구하려던 금액" 과 같은지는 알 수 없다 —
     * 그 대조는 승인 라우트가 lib/pricing.ts 로 재계산해서 따로 한다.
     */
    verifyAuthResult(auth: GatewayAuthResult): boolean {
        if (!auth.authToken || !auth.signature || auth.amount == null) {
            return false;
        }

        const expected = sha256Hex(
            `${auth.authToken}${this.clientKey}${auth.amount}${this.secretKey}`,
        );

        // 길이가 다르면 timingSafeEqual 이 예외를 던지므로 먼저 거른다.
        if (expected.length !== auth.signature.length) return false;

        // 서명 비교는 상수시간으로 — 문자열 === 는 조기 반환한다.
        let diff = 0;
        for (let i = 0; i < expected.length; i += 1) {
            diff |= expected.charCodeAt(i) ^ auth.signature.charCodeAt(i);
        }
        return diff === 0;
    }

    async approve(params: {
        transactionId: string;
        amount: number;
    }): Promise<GatewayPayment> {
        const ediDate = new Date().toISOString();

        // signData = hex(sha256(tid + amount + ediDate + secretKey))
        const signData = sha256Hex(
            `${params.transactionId}${params.amount}${ediDate}${this.secretKey}`,
        );

        return this.request(
            `/v1/payments/${encodeURIComponent(params.transactionId)}`,
            {
                method: "POST",
                body: { amount: params.amount, ediDate, signData },
                // 승인은 재시도가 금지된다. 타임아웃이면 조회·망취소로 정리한다.
                indeterminateOnTimeout: true,
                timeoutMs: APPROVE_TIMEOUT_MS,
            },
        );
    }

    async find(params: {
        transactionId?: string;
        orderId?: string;
    }): Promise<GatewayPayment> {
        const path = params.transactionId
            ? `/v1/payments/${encodeURIComponent(params.transactionId)}`
            : params.orderId
              ? `/v1/payments/find/${encodeURIComponent(params.orderId)}`
              : null;

        if (!path) {
            throw new PaymentGatewayError(
                "조회에는 transactionId 또는 orderId 가 필요하다",
                "INVALID_ARGUMENT",
            );
        }

        return this.request(path, { method: "GET" });
    }

    async cancel(params: CancelParams): Promise<GatewayPayment> {
        return this.request(
            `/v1/payments/${encodeURIComponent(params.transactionId)}/cancel`,
            {
                method: "POST",
                body: {
                    reason: params.reason,
                    orderId: params.orderId,
                    // 누락 시 전액 취소. 부분취소는 같은 orderId 로 재호출할 수 없다.
                    ...(params.amount != null
                        ? { cancelAmt: params.amount }
                        : {}),
                },
            },
        );
    }

    async netCancel(params: { orderId: string }): Promise<GatewayPayment> {
        return this.request("/v1/payments/netcancel", {
            method: "POST",
            body: { orderId: params.orderId },
        });
    }

    /** 공통 호출부 — 인증 헤더·타임아웃·결과코드 판정을 한곳에서 처리한다 */
    private async request(
        path: string,
        options: {
            method: "GET" | "POST";
            body?: Record<string, unknown>;
            indeterminateOnTimeout?: boolean;
            /** 생략하면 복구용 짧은 타임아웃. 승인만 길게 잡는다. */
            timeoutMs?: number;
        },
    ): Promise<GatewayPayment> {
        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(),
            options.timeoutMs ?? RECOVERY_TIMEOUT_MS,
        );

        let res: Response;
        try {
            res = await fetch(`${this.apiBase}${path}`, {
                method: options.method,
                headers: {
                    Authorization: `Basic ${this.credentials}`,
                    "Content-Type": "application/json; charset=utf-8",
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
                cache: "no-store",
            });
        } catch (e) {
            // 응답을 못 받았다 → 승인이 나갔는지 알 수 없다.
            throw new PaymentGatewayError(
                `NICEPAY 통신 실패: ${e instanceof Error ? e.message : String(e)}`,
                "NETWORK_ERROR",
                null,
                options.indeterminateOnTimeout === true,
            );
        } finally {
            clearTimeout(timer);
        }

        const text = await res.text().catch(() => "");
        let data: NicepayResponse;
        try {
            data = text ? (JSON.parse(text) as NicepayResponse) : {};
        } catch {
            throw new PaymentGatewayError(
                `NICEPAY 응답 파싱 실패(${res.status})`,
                "INVALID_RESPONSE",
                text,
                options.indeterminateOnTimeout === true,
            );
        }

        if (data.resultCode !== RESULT_OK) {
            throw new PaymentGatewayError(
                data.resultMsg ?? `NICEPAY 오류(${res.status})`,
                data.resultCode ?? String(res.status),
                data,
            );
        }

        return {
            // 부분취소는 원 거래와 다른 tid 를 돌려준다.
            transactionId: data.cancelledTid ?? data.tid ?? "",
            orderId: data.orderId ?? "",
            amount: data.amount ?? 0,
            status: toGatewayStatus(data.status),
            paidAt: toPaidAt(data.paidAt),
            receiptUrl: data.receiptUrl ?? null,
            balanceAmount: data.balanceAmt ?? null,
            raw: data,
        };
    }
}

/**
 * clientId 접두사로 환경을 판별한다.
 *  - S1_ · S2_ : 샌드박스
 *  - R1_ · R2_ : 운영
 *
 * 명시 설정보다 접두사 판별을 쓰는 이유는, 키만 바꿔 끼우면 호스트가 따라오게 해서
 * **샌드박스 키로 운영 API 를 때리는 사고**를 원천 차단하기 위해서다.
 */
export function resolveNicepayHosts(clientKey: string): {
    apiBase: string;
    sandbox: boolean;
} {
    const sandbox = /^S\d_/.test(clientKey);
    return {
        apiBase: sandbox
            ? "https://sandbox-api.nicepay.co.kr"
            : "https://api.nicepay.co.kr",
        sandbox,
    };
}

let gateway: PaymentGateway | null = null;

/**
 * PG 어댑터를 반환한다. 키가 없으면 던진다 —
 * 결제는 Mock 으로 대체할 수 있는 성질의 기능이 아니다.
 */
export function getPaymentGateway(): PaymentGateway {
    if (gateway) return gateway;

    const clientKey = process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY?.trim();
    const secretKey = process.env.NICEPAY_SECRET_KEY?.trim();

    if (!clientKey || !secretKey) {
        throw new Error(
            "NICEPAY 키가 없습니다. .env.local 에 NEXT_PUBLIC_NICEPAY_CLIENT_KEY 와 NICEPAY_SECRET_KEY 를 설정하세요.",
        );
    }

    const { apiBase } = resolveNicepayHosts(clientKey);
    gateway = new NicepayGateway(clientKey, secretKey, apiBase);
    return gateway;
}

/** 결제창 JS SDK URL — 클라이언트에서 script 태그로 로드한다 */
export const NICEPAY_SDK_URL = "https://pay.nicepay.co.kr/v1/js/";

/**
 * returnUrl 로 POST 되는 form 값을 중립 타입으로 옮긴다.
 * 값은 전부 문자열로 오므로 여기서 정규화한다.
 */
export function parseAuthResult(form: FormData): GatewayAuthResult {
    const get = (key: string) => {
        const v = form.get(key);
        return typeof v === "string" && v.length > 0 ? v : null;
    };

    const code = get("authResultCode") ?? "";
    const rawAmount = get("amount");
    const amount = rawAmount != null ? Number(rawAmount) : null;

    return {
        ok: code === RESULT_OK,
        code,
        message: get("authResultMsg") ?? "",
        transactionId: get("tid"),
        orderId: get("orderId"),
        amount: Number.isFinite(amount) ? amount : null,
        authToken: get("authToken"),
        signature: get("signature"),
    };
}

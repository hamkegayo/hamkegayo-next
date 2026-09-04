import { randomBytes } from "node:crypto";

import { calcPrepayment } from "@/lib/pricing";
import type { PlanCode } from "@/lib/reservation";

/**
 * 결제 금액·주문번호 산정 (#53).
 *
 *  금액은 **절대 클라이언트에서 받지 않는다.** 예약 행을 서버가 읽어 재계산한다.
 *  이 모듈은 부수효과가 없어서 라우트와 별개로 검증할 수 있다.
 */

/** 나이스페이 orderId 는 64byte 까지. 예약번호 + 난수로 충돌을 피한다. */
export function generateOrderId(reservationCode: string): string {
    const suffix = randomBytes(6).toString("hex");
    return `${reservationCode}-${Date.now().toString(36)}-${suffix}`.slice(
        0,
        64,
    );
}

/** 추가결제 링크 토큰 — 랜덤 32자 이상, 1회용 (#75 에서 사용) */
export function generatePayToken(): string {
    return randomBytes(32).toString("base64url");
}

export type PaymentAmounts = {
    /** 총 청구액(할인 전). payments.gross_amount */
    gross: number;
    /** 포인트 사용액. payments.discount_amount */
    discount: number;
    /** 플랫폼 수수료. payments.commission_amount */
    commission: number;
    /** 파트너 지급 대상액. payments.payout_amount */
    payout: number;
    /** 실제 PG 로 승인 요청할 금액 */
    charge: number;
    commissionRate: number;
};

/**
 * 선결제 금액 구성.
 *
 *  포인트 할인은 **플랫폼이 부담한다** (2026-09-04 기획 확정).
 *     포인트는 회사가 발행한 보상(약관 제16조 ⑨ · 제19조 ⑤⑥)이므로,
 *     이용자가 그것을 쓴다고 해서 파트너 지급액이 줄어서는 안 된다.
 *     그래서 할인분을 수수료에서 뺀다 → payout 은 할인과 무관하게 유지된다.
 *
 *       payout = gross - discount - commission
 *              = gross - discount - (gross*rate - discount)
 *              = gross - gross*rate                       ← 할인이 상쇄된다
 *
 *     할인이 수수료보다 크면 commission 이 음수가 된다(플랫폼 순손실).
 *     스키마상 허용되며, 그 자체가 "이 건은 역마진" 이라는 정확한 기록이다.
 */
export function calcPaymentAmounts(params: {
    plan: PlanCode;
    durationMinutes: number;
    surchargeRate: number;
    feeRate: number;
    /** 사용할 포인트(원). 0 이면 할인 없음 */
    pointsToUse: number;
}): PaymentAmounts {
    const { plan, durationMinutes, surchargeRate, feeRate } = params;

    // 예약 시점에 고정한 할증률을 그대로 쓴다(공휴일 지정이 나중에 바뀌어도 흔들리지 않게).
    const prepayment = calcPrepayment(plan, durationMinutes, surchargeRate > 0);
    const gross = prepayment.amount;

    // 사용 포인트는 총액을 넘을 수 없다.
    const discount = Math.max(
        0,
        Math.min(Math.floor(params.pointsToUse), gross),
    );

    const baseCommission = Math.round(gross * feeRate);
    const commission = baseCommission - discount;
    const payout = gross - discount - commission;

    return {
        gross,
        discount,
        commission,
        payout,
        charge: gross - discount,
        commissionRate: feeRate,
    };
}

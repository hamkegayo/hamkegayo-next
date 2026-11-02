import { OPENING_EVENT_CAPACITY } from "./opening-event";

export type OpeningCouponState =
    | "AVAILABLE"
    | "HELD"
    | "USED"
    | "EXHAUSTED"
    | "WAITING"
    | "PAUSED"
    | "CLOSED"
    | "HIDDEN";

/** 쿠폰함 응답 (`opening_event_coupon()`). */
export type OpeningCoupon = {
    state: OpeningCouponState;
    /** 확보(HELD)·사용(USED)한 실제 할인액. 예약 전에는 서비스가 정해지지 않아 null 이다. */
    discount: number | null;
    /** 서비스별 쿠폰액. 예약 서비스에 따라 자동 적용된다 (#297). */
    discounts?: { basic: number; plus: number };
    remaining?: number;
    reservationId?: string | null;
};

export const OPENING_COUPON_MESSAGES: Record<OpeningCouponState, string> = {
    AVAILABLE: `예약 확정 선착순 ${OPENING_EVENT_CAPACITY}명 한정 · 쿠폰 보유만으로 혜택이 확보되지는 않습니다.`,
    HELD: "결제 중인 예약에 쿠폰을 임시 확보했습니다. 결제 완료 후 사용이 확정됩니다.",
    USED: "사용 완료된 쿠폰입니다.",
    EXHAUSTED: "선착순 혜택이 소진되었습니다.",
    WAITING: "현재 다른 고객이 결제 중입니다. 잠시 후 다시 확인해 주세요.",
    PAUSED: "현재 쿠폰 사용이 일시 중지되었습니다.",
    CLOSED: "이벤트가 종료되었습니다.",
    HIDDEN: "사용 가능한 오픈 이벤트 쿠폰이 없습니다.",
};

export function openingCouponError(message: string): string {
    if (message.includes("campaign_capacity_held"))
        return OPENING_COUPON_MESSAGES.WAITING;
    if (message.includes("campaign_full"))
        return OPENING_COUPON_MESSAGES.EXHAUSTED;
    if (message.includes("campaign_ended"))
        return OPENING_COUPON_MESSAGES.CLOSED;
    return "쿠폰을 적용하지 못했습니다. 쿠폰함에서 자격과 잔여 혜택을 다시 확인해 주세요.";
}

/** PG 승인 뒤 결제 확정(finalize_payment)에서 쿠폰 때문에 거부된 경우의 결과 코드. */
export type OpeningCouponConfirmFailure = "COUPON_ENDED" | "COUPON_EXHAUSTED";

export const OPENING_COUPON_CONFIRM_MESSAGES: Record<
    OpeningCouponConfirmFailure,
    string
> = {
    COUPON_ENDED:
        "이벤트 기간이 끝나 쿠폰이 적용되지 않았습니다. 결제는 취소되었으니 쿠폰 없이 다시 결제해 주세요.",
    COUPON_EXHAUSTED:
        "선착순 혜택이 소진되어 쿠폰이 적용되지 않았습니다. 결제는 취소되었으니 쿠폰 없이 다시 결제해 주세요.",
};

/**
 * 결제 확정 트리거(`commit_opening_event_payment`)의 거부 사유를 결과 코드로 바꾼다.
 * 쿠폰과 무관한 실패면 null — 일반 확정 실패(CONFIRM_FAILED)로 처리한다.
 */
export function openingCouponConfirmFailure(
    dbMessage: string,
): OpeningCouponConfirmFailure | null {
    if (dbMessage.includes("campaign_ended")) return "COUPON_ENDED";
    if (dbMessage.includes("campaign_full")) return "COUPON_EXHAUSTED";
    return null;
}

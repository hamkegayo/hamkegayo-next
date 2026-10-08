export type OpeningCouponState =
    | "AVAILABLE"
    | "HELD"
    | "USED"
    | "EXHAUSTED"
    | "WAITING"
    | "PAUSED"
    | "CLOSED"
    | "HIDDEN";

export type OpeningCoupon = {
    state: OpeningCouponState;
    discount: number;
    remaining?: number;
    reservationId?: string | null;
};

export const OPENING_COUPON_MESSAGES: Record<OpeningCouponState, string> = {
    AVAILABLE:
        "예약 확정 선착순 20명 한정 · 쿠폰 보유만으로 혜택이 확보되지는 않습니다.",
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
    return "쿠폰을 적용하지 못했습니다. 쿠폰함에서 자격과 잔여 혜택을 다시 확인해 주세요.";
}

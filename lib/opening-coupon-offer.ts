import {
    OPENING_COUPON_MESSAGES,
    type OpeningCouponState,
} from "./opening-coupon";

export type OpeningCouponOffer = {
    eligible: boolean;
    discount: number;
    state: OpeningCouponState;
};
export const EMPTY_COUPON_OFFER: OpeningCouponOffer = {
    eligible: false,
    discount: 0,
    state: "HIDDEN",
};

export function parseCouponOffer(value: unknown): OpeningCouponOffer {
    if (!value || typeof value !== "object") return EMPTY_COUPON_OFFER;
    const offer = value as Record<string, unknown>;
    const state =
        typeof offer.state === "string" &&
        Object.hasOwn(OPENING_COUPON_MESSAGES, offer.state)
            ? (offer.state as OpeningCouponState)
            : "HIDDEN";
    const discount = Number(offer.discount);
    return {
        eligible:
            offer.eligible === true && ["AVAILABLE", "HELD"].includes(state),
        discount: Number.isInteger(discount) && discount > 0 ? discount : 0,
        state,
    };
}

export function couponIneligibleMessage(
    offer: OpeningCouponOffer,
): string | null {
    // 사용 가능(AVAILABLE)·비대상(HIDDEN) 상태는 비적용 배너를 띄우지 않는다.
    if (
        offer.eligible ||
        offer.state === "HIDDEN" ||
        offer.state === "AVAILABLE"
    ) {
        return null;
    }
    // HELD 인데 eligible=false 는 다른 예약 결제에서 쿠폰을 임시 확보 중인 경우다.
    // 이 예약에 확보된 것처럼 오해되지 않게 구분해 안내한다.
    if (offer.state === "HELD") {
        return "다른 결제 중인 예약에 쿠폰이 임시 확보되어 있어 이 예약에는 바로 적용할 수 없습니다.";
    }
    return OPENING_COUPON_MESSAGES[offer.state];
}

export async function loadCouponOffer(
    reservationId: string,
    signal?: AbortSignal,
): Promise<OpeningCouponOffer> {
    // 식별값 등록(POST)과 조회(GET)를 나눈다 (#283 리뷰). 등록 실패는 조회 결과가 사용 불가로 알린다.
    await fetch("/api/campaigns/opening/register", {
        method: "POST",
        cache: "no-store",
        signal,
    }).catch(() => null);
    const response = await fetch(
        `/api/campaigns/opening/offer?rid=${encodeURIComponent(reservationId)}`,
        { cache: "no-store", signal },
    );
    if (!response.ok) return EMPTY_COUPON_OFFER;
    return parseCouponOffer(await response.json());
}

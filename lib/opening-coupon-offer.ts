import { useEffect, useState } from "react";

import {
    OPENING_COUPON_MESSAGES,
    type OpeningCoupon,
    type OpeningCouponState,
} from "./opening-coupon";

export type OpeningCouponOffer = {
    eligible: boolean;
    discount: number;
    state: OpeningCouponState;
    /** 행사 종료 여부. 서버가 알려준 경우에만 true 로 들어간다. */
    ended?: boolean;
    /** 일시적 조회 오류 여부. true 이면 미대상(HIDDEN) 안내를 노출하지 않는다. */
    failed?: boolean;
};
export const EMPTY_COUPON_OFFER: OpeningCouponOffer = {
    eligible: false,
    discount: 0,
    state: "HIDDEN",
};
export const FAILED_COUPON_OFFER: OpeningCouponOffer = {
    eligible: false,
    discount: 0,
    state: "HIDDEN",
    failed: true,
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
        ...(offer.ended === true ? { ended: true } : {}),
        ...(offer.failed === true ? { failed: true } : {}),
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

// ---------------------------------------------------------------------------
// 쿠폰함 상태 (`GET /api/campaigns/opening/coupon`) — 예약 1-6단계 안내·마이페이지 배지용 (#282)
// 보유 안내일 뿐 혜택 확보가 아니다. 실패·비로그인은 모두 HIDDEN 으로 본다.
// ---------------------------------------------------------------------------

export const HIDDEN_COUPON_STATUS: OpeningCoupon = {
    state: "HIDDEN",
    discount: 0,
};

function parseAmount(value: unknown): number {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : 0;
}

export function parseCouponStatus(value: unknown): OpeningCoupon {
    if (!value || typeof value !== "object") return HIDDEN_COUPON_STATUS;
    const raw = value as Record<string, unknown>;
    const state =
        typeof raw.state === "string" &&
        Object.hasOwn(OPENING_COUPON_MESSAGES, raw.state)
            ? (raw.state as OpeningCouponState)
            : "HIDDEN";
    const status: OpeningCoupon = {
        state,
        discount: parseAmount(raw.discount),
    };
    if (raw.discounts && typeof raw.discounts === "object") {
        const d = raw.discounts as Record<string, unknown>;
        status.discounts = {
            basic: parseAmount(d.basic),
            plus: parseAmount(d.plus),
        };
    }
    if (raw.ended === true) status.ended = true;
    return status;
}

export async function loadCouponStatus(
    signal?: AbortSignal,
): Promise<OpeningCoupon> {
    try {
        const response = await fetch("/api/campaigns/opening/coupon", {
            cache: "no-store",
            signal,
        });
        if (!response.ok) return HIDDEN_COUPON_STATUS;
        return parseCouponStatus(await response.json());
    } catch {
        return HIDDEN_COUPON_STATUS;
    }
}

/** 선택한 서비스의 쿠폰 할인액. 서비스를 아직 모르면 안내용 최소액(`discount`)이다. */
export function couponDiscountFor(
    status: OpeningCoupon,
    plan: "basic" | "plus" | "",
): number {
    if (plan && status.discounts) return status.discounts[plan];
    return status.discount;
}

/** 조회가 끝나기 전에는 HIDDEN 으로 두어 안내가 깜빡이지 않게 한다. */
export function useCouponStatus(): OpeningCoupon {
    const [status, setStatus] = useState<OpeningCoupon>(HIDDEN_COUPON_STATUS);
    useEffect(() => {
        const controller = new AbortController();
        void loadCouponStatus(controller.signal).then((next) => {
            if (!controller.signal.aborted) setStatus(next);
        });
        return () => controller.abort();
    }, []);
    return status;
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
    try {
        const response = await fetch(
            `/api/campaigns/opening/offer?rid=${encodeURIComponent(reservationId)}`,
            { cache: "no-store", signal },
        );
        if (!response.ok) return FAILED_COUPON_OFFER;
        return parseCouponOffer(await response.json());
    } catch {
        return FAILED_COUPON_OFFER;
    }
}

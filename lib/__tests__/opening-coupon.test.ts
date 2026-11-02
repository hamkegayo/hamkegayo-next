import { describe, expect, it } from "vitest";
import {
    OPENING_COUPON_CONFIRM_MESSAGES,
    openingCouponConfirmFailure,
    openingCouponError,
    OPENING_COUPON_MESSAGES,
} from "../opening-coupon";
import { openingEventCustomerAmount } from "../opening-event-charge";
import {
    OPENING_EVENT_CAPACITY,
    OPENING_EVENT_DISCOUNT,
    OPENING_EVENT_TERMS,
} from "../opening-event";
import { calcPrepayment } from "../pricing";

describe("opening coupon", () => {
    // #297 수용 기준: 할증 없는 2시간 예약
    it("charges Basic 20,000 and Plus 25,000 for two hours", () => {
        const basic = calcPrepayment("basic", 120, false, 0).amount;
        const plus = calcPrepayment("plus", 120, false, 0).amount;
        expect(basic).toBe(40000);
        expect(plus).toBe(50000);
        expect(OPENING_EVENT_DISCOUNT).toEqual({ basic: 20000, plus: 25000 });
        expect(
            openingEventCustomerAmount(basic, OPENING_EVENT_DISCOUNT.basic),
        ).toBe(20000);
        expect(
            openingEventCustomerAmount(plus, OPENING_EVENT_DISCOUNT.plus),
        ).toBe(25000);
    });
    it("keeps the discount fixed when a surcharge applies", () => {
        // Basic 2시간 할증 30%: 52,000 - 20,000. 할인액에 할증률을 곱하지 않는다.
        const gross = calcPrepayment("basic", 120, true, 0.3).amount;
        expect(gross).toBe(52000);
        expect(
            openingEventCustomerAmount(gross, OPENING_EVENT_DISCOUNT.basic),
        ).toBe(32000);
    });
    it("caps early completion discount and preserves historical amounts", () => {
        expect(openingEventCustomerAmount(20000, 20000)).toBe(0);
        expect(openingEventCustomerAmount(20000, 25000)).toBe(0);
        // #276 기간에 확정된 Basic 25,000원 쿠폰은 저장된 할인액으로 계산한다.
        expect(openingEventCustomerAmount(40000, 25000)).toBe(15000);
        expect(openingEventCustomerAmount(20000, 20000, true)).toBe(20000);
        expect(openingEventCustomerAmount(20000, 25000, true)).toBe(20000);
    });
    it("distinguishes payment holds, exhaustion and the event end", () => {
        expect(openingCouponError("campaign_capacity_held")).toBe(
            OPENING_COUPON_MESSAGES.WAITING,
        );
        expect(openingCouponError("campaign_full")).toBe(
            OPENING_COUPON_MESSAGES.EXHAUSTED,
        );
        expect(openingCouponError("campaign_ended")).toBe(
            OPENING_COUPON_MESSAGES.CLOSED,
        );
    });
    it("maps coupon rejections at payment confirmation to retry guidance", () => {
        expect(openingCouponConfirmFailure("campaign_ended")).toBe(
            "COUPON_ENDED",
        );
        expect(openingCouponConfirmFailure("campaign_full")).toBe(
            "COUPON_EXHAUSTED",
        );
        expect(openingCouponConfirmFailure("campaign_claim_invalid")).toBe(
            null,
        );
        expect(openingCouponConfirmFailure("payment_expired")).toBe(null);
        expect(OPENING_COUPON_CONFIRM_MESSAGES.COUPON_ENDED).toContain(
            "쿠폰 없이 다시 결제",
        );
    });
    it("no longer advertises the common 25,000 coupon or 20 seats", () => {
        expect(OPENING_EVENT_CAPACITY).toBe(10);
        const texts = [
            ...OPENING_EVENT_TERMS,
            ...Object.values(OPENING_COUPON_MESSAGES),
        ].join("\n");
        expect(texts).not.toMatch(/공통|모두 25,000원|20명/);
        expect(texts).toContain("선착순 10명");
        expect(texts).toContain("2026년 12월 31일");
    });
});

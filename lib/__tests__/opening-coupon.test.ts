import { describe, expect, it } from "vitest";
import { openingCouponError, OPENING_COUPON_MESSAGES } from "../opening-coupon";
import { openingEventCustomerAmount } from "../opening-event-charge";

describe("opening coupon", () => {
    it("charges Basic 15,000 and Plus 25,000 for two hours", () => {
        expect(openingEventCustomerAmount(40000, 25000)).toBe(15000);
        expect(openingEventCustomerAmount(50000, 25000)).toBe(25000);
    });
    it("caps early completion discount and preserves historical amounts", () => {
        expect(openingEventCustomerAmount(20000, 25000)).toBe(0);
        expect(openingEventCustomerAmount(40000, 20000)).toBe(20000);
        expect(openingEventCustomerAmount(20000, 25000, true)).toBe(20000);
    });
    it("distinguishes payment holds from exhaustion", () => {
        expect(openingCouponError("campaign_capacity_held")).toBe(
            OPENING_COUPON_MESSAGES.WAITING,
        );
        expect(openingCouponError("campaign_full")).toBe(
            OPENING_COUPON_MESSAGES.EXHAUSTED,
        );
    });
});

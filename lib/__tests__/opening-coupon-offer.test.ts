import { afterEach, describe, expect, it, vi } from "vitest";
import {
    EMPTY_COUPON_OFFER,
    loadCouponOffer,
    parseCouponOffer,
} from "../opening-coupon-offer";
import { openingEventCustomerAmount } from "../opening-event-charge";
import { calcSettlementDiff } from "../pricing";
import { noShowNotification } from "../no-show-notification";

afterEach(() => vi.unstubAllGlobals());
describe("coupon review regressions", () => {
    it("Basic two-hour no-show requires 5000 after cash prepayment 15000", () => {
        const prepaid = openingEventCustomerAmount(40000, 25000);
        const total = openingEventCustomerAmount(20000, 25000, true);
        expect(calcSettlementDiff(prepaid, total)).toEqual({
            additional: 5000,
            refund: 0,
        });
        const message = noShowNotification(
            total,
            prepaid,
            calcSettlementDiff(prepaid, total),
        );
        expect(message).toContain("차액 5,000원을 추가 결제");
        expect(message).not.toContain("선결제 금액에서 처리됩니다");
    });
    it("refund and exact payment notifications reflect the actual diff", () => {
        expect(
            noShowNotification(20000, 55000, calcSettlementDiff(55000, 20000)),
        ).toContain("잔액 35,000원");
        expect(
            noShowNotification(25000, 25000, calcSettlementDiff(25000, 25000)),
        ).toContain("선결제 금액에서 처리됩니다");
    });
    it("does not enable unknown or paused states", () => {
        expect(
            parseCouponOffer({
                eligible: true,
                state: "PAUSED",
                discount: 25000,
            }).eligible,
        ).toBe(false);
        expect(
            parseCouponOffer({
                eligible: true,
                state: "unexpected",
                discount: 25000,
            }).eligible,
        ).toBe(false);
        expect(parseCouponOffer(null)).toEqual(EMPTY_COUPON_OFFER);
    });
    it("uses the same parser for initial load and unavailable refresh", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue({
                    ok: true,
                    json: async () => ({
                        eligible: false,
                        state: "EXHAUSTED",
                        discount: 25000,
                    }),
                }),
        );
        expect(await loadCouponOffer("reservation")).toEqual({
            eligible: false,
            state: "EXHAUSTED",
            discount: 25000,
        });
    });
    it("failed offer clears eligibility", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
        expect(await loadCouponOffer("reservation")).toEqual(
            EMPTY_COUPON_OFFER,
        );
    });
});

import { describe, expect, it } from "vitest";

import {
    paymentErrorMessage,
    resumeStepFor,
    stepAfterRegistration,
    totalStepsFor,
} from "../flow-branch";

describe("stepAfterRegistration", () => {
    it("신규 방식은 지원 대기·선택 없이 바로 결제(7)", () => {
        expect(stepAfterRegistration("admin_direct")).toBe(7);
    });
    it("기존 방식은 매칭 대기(5) 그대로", () => {
        expect(stepAfterRegistration("legacy_auto")).toBe(5);
    });
});

describe("totalStepsFor & paymentErrorMessage", () => {
    it("신규 방식은 6단계, 기존 방식은 8단계", () => {
        expect(totalStepsFor("admin_direct")).toBe(6);
        expect(totalStepsFor("legacy_auto")).toBe(8);
    });
    it("PAYMENT_EXPIRED는 방식별로 알맞은 안내를 반환한다", () => {
        expect(paymentErrorMessage("PAYMENT_EXPIRED", "admin_direct")).toBe(
            "결제 유효 시간이 지났습니다. 다시 결제를 진행해 주세요.",
        );
        expect(paymentErrorMessage("PAYMENT_EXPIRED", "legacy_auto")).toContain(
            "파트너 선택이 해제되었습니다",
        );
    });
});

describe("resumeStepFor", () => {
    const direct = { matchingMode: "admin_direct" as const, partnerId: "" };
    it("신규 방식 결제 전 → 결제", () => {
        expect(
            resumeStepFor({ ...direct, status: "MATCHING", paidAt: "" }),
        ).toBe(7);
    });
    it("신규 방식 결제 후(매칭 대기) → 완료 안내, 파트너 선택 아님", () => {
        expect(
            resumeStepFor({ ...direct, status: "MATCHING", paidAt: "t" }),
        ).toBe(8);
    });
    it("신규 방식 취소 → 예약 현황", () => {
        expect(
            resumeStepFor({ ...direct, status: "CANCELLED", paidAt: "t" }),
        ).toBe("mypage");
    });
    const legacy = { matchingMode: "legacy_auto" as const, paidAt: "" };
    it("기존 방식은 종전 판정 그대로", () => {
        expect(
            resumeStepFor({ ...legacy, status: "CONFIRMED", partnerId: "p" }),
        ).toBe(8);
        expect(
            resumeStepFor({ ...legacy, status: "MATCHING", partnerId: "p" }),
        ).toBe(7);
        expect(
            resumeStepFor({ ...legacy, status: "MATCHING", partnerId: "" }),
        ).toBe(6);
    });
});

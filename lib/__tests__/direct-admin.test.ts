import { describe, expect, it } from "vitest";

import {
    canResendIntake,
    directAdminPhase,
    directErrorMessage,
    formatElapsed,
    intakeNotifyLabel,
    isOverdueSincePaid,
    validateAssignInput,
    validateCustomerNoticeMemo,
    validateFailureInput,
    validateFailureNoticeInput,
} from "@/lib/direct-admin";

const base = {
    reservationId: "R",
    partnerId: "P",
    channel: "PHONE",
    acceptanceConfirmed: true,
};

describe("validateAssignInput", () => {
    it("requires the external-acceptance checkbox", () => {
        const r = validateAssignInput({ ...base, acceptanceConfirmed: false });
        expect(r.ok).toBe(false);
    });
    it("requires a partner and a known channel", () => {
        expect(validateAssignInput({ ...base, partnerId: "" }).ok).toBe(false);
        expect(validateAssignInput({ ...base, channel: "FAX" }).ok).toBe(false);
    });
    it("trims the optional memo and caps it at 500 chars", () => {
        expect(validateAssignInput({ ...base, memo: "  " })).toMatchObject({
            ok: true,
            memo: null,
        });
        expect(
            validateAssignInput({ ...base, memo: " 통화 확인 " }),
        ).toMatchObject({ ok: true, memo: "통화 확인" });
        expect(
            validateAssignInput({ ...base, memo: "가".repeat(501) }).ok,
        ).toBe(false);
    });
});

describe("failure inputs", () => {
    it("matching failure needs consent and a reason", () => {
        expect(
            validateFailureInput({ confirmed: false, reason: "사유" }).ok,
        ).toBe(false);
        expect(validateFailureInput({ confirmed: true, reason: " " }).ok).toBe(
            false,
        );
        expect(
            validateFailureInput({ confirmed: true, reason: " 파트너 없음 " }),
        ).toEqual({ ok: true, reason: "파트너 없음" });
    });
    it("failure notice needs the check and a known method; memo optional", () => {
        expect(
            validateFailureNoticeInput({ confirmed: false, method: "PHONE" })
                .ok,
        ).toBe(false);
        expect(
            validateFailureNoticeInput({ confirmed: true, method: "FAX" }).ok,
        ).toBe(false);
        expect(
            validateFailureNoticeInput({ confirmed: true, method: "EMAIL" }),
        ).toMatchObject({ ok: true, memo: null });
    });
    it("partner notice memo is optional and capped", () => {
        expect(validateCustomerNoticeMemo(undefined)).toEqual({
            ok: true,
            memo: null,
        });
        expect(validateCustomerNoticeMemo("x".repeat(501)).ok).toBe(false);
    });
});

describe("directErrorMessage", () => {
    it.each([
        ["partner_unavailable", "겹칩니다"],
        ["partner_not_active", "활동 중인 파트너"],
        ["payment_not_paid", "결제가 완료된"],
        ["service_already_started", "시작되어"],
        ["state_changed", "다른 운영자"],
        ["not_assignable", "배정할 수 없는"],
    ])("maps %s", (message, snippet) => {
        expect(directErrorMessage({ message }, "fallback")).toContain(snippet);
    });
    it("maps permission errors and falls back otherwise", () => {
        expect(
            directErrorMessage({ code: "42501", message: "x" }, "f"),
        ).toContain("권한");
        expect(directErrorMessage({ message: "boom" }, "fallback")).toBe(
            "fallback",
        );
    });
});

describe("24-hour warning", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    it("is overdue only after 24 hours since payment", () => {
        expect(isOverdueSincePaid("2026-11-19T12:01:00Z", now)).toBe(false);
        expect(isOverdueSincePaid("2026-11-19T11:59:00Z", now)).toBe(true);
        expect(isOverdueSincePaid(null, now)).toBe(false);
    });
    it("formats elapsed time", () => {
        expect(formatElapsed(45)).toBe("45분");
        expect(formatElapsed(200)).toBe("3시간 20분");
        expect(formatElapsed(26 * 60)).toBe("1일 2시간");
        expect(formatElapsed(null)).toBe("-");
    });
});

describe("intake notify state", () => {
    it("distinguishes sent / pending / failed", () => {
        expect(intakeNotifyLabel("SENT").tone).toBe("ok");
        expect(intakeNotifyLabel("PENDING").tone).toBe("warn");
        expect(intakeNotifyLabel("FAILED", 3).label).toContain("재시도 예정");
        expect(intakeNotifyLabel("FAILED", 8).label).toContain("중단");
    });
    it("never offers resend for an already sent intake", () => {
        expect(canResendIntake("SENT")).toBe(false);
        expect(canResendIntake("FAILED")).toBe(true);
        expect(canResendIntake("PENDING")).toBe(true);
    });
});

describe("directAdminPhase", () => {
    const s = {
        reservationStatus: "MATCHING",
        confirmedPartnerId: null,
        paidAt: "2026-11-19T00:00:00Z",
        serviceStatus: null,
        serviceStartedAt: null,
        refundStatus: null,
    };
    it("paid unassigned is assignable", () =>
        expect(directAdminPhase(s)).toBe("ASSIGNABLE"));
    it("unpaid or refunding is not assignable", () => {
        expect(directAdminPhase({ ...s, paidAt: null })).toBe("OTHER");
        expect(directAdminPhase({ ...s, refundStatus: "REQUESTED" })).toBe(
            "OTHER",
        );
    });
    it("confirmed before service start is reassignable; after start it is blocked", () => {
        const c = {
            ...s,
            reservationStatus: "CONFIRMED",
            confirmedPartnerId: "P",
            serviceStatus: "SCHEDULED",
        };
        expect(directAdminPhase(c)).toBe("REASSIGNABLE");
        expect(
            directAdminPhase({
                ...c,
                serviceStatus: "IN_PROGRESS",
                serviceStartedAt: "2026-11-20T01:00:00Z",
            }),
        ).toBe("STARTED");
        expect(
            directAdminPhase({
                ...c,
                serviceStartedAt: "2026-11-20T01:00:00Z",
            }),
        ).toBe("STARTED");
    });
    it("cancelled is the failure/refund phase", () => {
        expect(directAdminPhase({ ...s, reservationStatus: "CANCELLED" })).toBe(
            "FAILED",
        );
    });
});

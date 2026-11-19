import { describe, expect, it } from "vitest";

import {
    DIRECT_PHASE_LABEL,
    canCancelBeforeAssignment,
    directPhase,
    directPhaseDescription,
} from "@/lib/direct-reservation-status";

const base = { paidAt: null, refundStatus: null };

describe("directPhase", () => {
    it("결제 전 / 결제 완료·배정 대기를 구분한다", () => {
        expect(directPhase({ ...base, status: "MATCHING" })).toBe("UNPAID");
        expect(
            directPhase({ ...base, status: "MATCHING", paidAt: "2026-12-01" }),
        ).toBe("WAITING");
    });
    it("확정·완료는 확정이다", () => {
        expect(directPhase({ ...base, status: "CONFIRMED" })).toBe("CONFIRMED");
        expect(directPhase({ ...base, status: "COMPLETED" })).toBe("CONFIRMED");
    });
    it("환불 완료는 REFUNDED 일 때만이다", () => {
        const c = { status: "CANCELLED", paidAt: "x" };
        expect(directPhase({ ...c, refundStatus: "REFUNDED" })).toBe(
            "REFUNDED",
        );
        expect(directPhase({ ...c, refundStatus: "REQUESTED" })).toBe(
            "REFUND_IN_PROGRESS",
        );
        expect(directPhase({ ...c, refundStatus: "PROCESSING" })).toBe(
            "REFUND_IN_PROGRESS",
        );
    });
    it("PG 취소 실패는 환불 완료로 보이지 않는다", () => {
        const phase = directPhase({
            status: "CANCELLED",
            paidAt: "x",
            refundStatus: "PG_FAILED",
        });
        expect(phase).toBe("REFUND_DELAYED");
        expect(DIRECT_PHASE_LABEL[phase]).not.toContain("완료");
        expect(directPhaseDescription(phase, "CUSTOMER_CANCEL")).toContain(
            "환불이 완료된 것이 아니",
        );
    });
    it("환불 행이 없는 취소는 단순 취소다", () => {
        expect(directPhase({ ...base, status: "CANCELLED" })).toBe(
            "CANCELLED_NO_PAYMENT",
        );
    });
});

describe("표시 문구", () => {
    it("매칭 실패 환불은 사유를 말한다", () => {
        expect(directPhaseDescription("REFUNDED", "MATCH_FAILED")).toContain(
            "배정이 어려워",
        );
        expect(directPhaseDescription("REFUNDED", "CUSTOMER_CANCEL")).toContain(
            "예약이 취소되어",
        );
    });
    it("결제 완료·배정 대기를 예약 확정으로 표시하지 않는다", () => {
        expect(DIRECT_PHASE_LABEL.WAITING).not.toContain("확정");
        expect(directPhaseDescription("WAITING", null)).toContain(
            "24시간 이내",
        );
    });
});

describe("canCancelBeforeAssignment", () => {
    it("결제 전·배정 대기만 취소할 수 있다", () => {
        expect(canCancelBeforeAssignment("UNPAID")).toBe(true);
        expect(canCancelBeforeAssignment("WAITING")).toBe(true);
        expect(canCancelBeforeAssignment("CONFIRMED")).toBe(false);
        expect(canCancelBeforeAssignment("REFUND_IN_PROGRESS")).toBe(false);
        expect(canCancelBeforeAssignment("REFUND_DELAYED")).toBe(false);
        expect(canCancelBeforeAssignment("REFUNDED")).toBe(false);
    });
});

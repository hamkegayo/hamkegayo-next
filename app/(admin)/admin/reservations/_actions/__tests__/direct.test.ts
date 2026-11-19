import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
    rpc: vi.fn(),
    getUser: vi.fn(),
    dispatch: vi.fn(),
    fail: vi.fn(),
    retry: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        rpc: mock.rpc,
        auth: { getUser: mock.getUser },
    }),
}));
vi.mock("@/lib/intake-notification.server", () => ({
    dispatchIntakeNotifications: mock.dispatch,
}));
vi.mock("@/lib/payments/direct-refund", () => ({
    failMatchingAndRefund: mock.fail,
    retryDirectRefund: mock.retry,
}));

import {
    assignPartnerAction,
    failMatchingAction,
    recordFailureNoticeAction,
    resendIntakeEmailAction,
    retryRefundAction,
} from "../direct";

const assign = {
    reservationId: "R",
    partnerId: "P",
    channel: "PHONE",
    acceptanceConfirmed: true,
    memo: "통화 완료",
    expectedAction: "ASSIGN" as const,
};

const refundDone = {
    ok: true,
    cash: 1000,
    restoredPoints: 0,
    couponRestored: false,
    couponRestoreSkipped: false,
    already: false,
};

beforeEach(() => {
    vi.resetAllMocks();
    mock.getUser.mockResolvedValue({ data: { user: { id: "A" } } });
    mock.rpc.mockResolvedValue({ data: { action: "ASSIGNED" }, error: null });
});

describe("assignPartnerAction", () => {
    it("blocks without the acceptance check, before touching the DB", async () => {
        const r = await assignPartnerAction({
            ...assign,
            acceptanceConfirmed: false,
        });
        expect(r.ok).toBe(false);
        expect(mock.rpc).not.toHaveBeenCalled();
    });

    it("assigns through the RPC with the expected action (no client-supplied admin flag)", async () => {
        const r = await assignPartnerAction(assign);
        expect(r.ok).toBe(true);
        expect(mock.rpc).toHaveBeenCalledWith("admin_assign_partner", {
            p_reservation: "R",
            p_partner: "P",
            p_accepted_channel: "PHONE",
            p_accepted_memo: "통화 완료",
            p_expected_action: "ASSIGN",
        });
    });

    it("reports reassignment", async () => {
        mock.rpc.mockResolvedValue({
            data: { action: "REASSIGNED" },
            error: null,
        });
        const r = await assignPartnerAction({
            ...assign,
            expectedAction: "REASSIGN",
        });
        expect(r.ok && r.message).toContain("변경");
    });

    it.each([
        ["partner_unavailable", "겹칩니다"],
        ["partner_not_active", "활동 중인 파트너"],
        ["payment_not_paid", "결제가 완료된"],
        ["service_already_started", "시작되어"],
        ["not_assignable", "배정할 수 없는"],
    ])("surfaces %s as a clear message", async (message, snippet) => {
        mock.rpc.mockResolvedValue({
            data: null,
            error: { message, code: "23514" },
        });
        const r = await assignPartnerAction(assign);
        expect(r.ok).toBe(false);
        expect(!r.ok && r.message).toContain(snippet);
    });

    it("rejects when there is no session", async () => {
        mock.getUser.mockResolvedValue({ data: { user: null } });
        expect((await assignPartnerAction(assign)).ok).toBe(false);
        expect(mock.rpc).not.toHaveBeenCalled();
    });

    it("relays the DB admin-permission refusal", async () => {
        mock.rpc.mockResolvedValue({
            data: null,
            error: { message: "forbidden", code: "42501" },
        });
        const r = await assignPartnerAction(assign);
        expect(!r.ok && r.message).toContain("권한");
    });
});

describe("failMatchingAction / refund", () => {
    it("requires consent and a reason before starting a refund", async () => {
        expect(
            (
                await failMatchingAction({
                    reservationId: "R",
                    reason: "x",
                    confirmed: true,
                })
            ).ok,
        ).toBe(false);
        expect(
            (
                await failMatchingAction({
                    reservationId: "R",
                    reason: "파트너 없음",
                    confirmed: false,
                })
            ).ok,
        ).toBe(false);
        expect(mock.fail).not.toHaveBeenCalled();
    });

    it("reports a completed PG refund", async () => {
        mock.fail.mockResolvedValue({
            ok: true,
            refundId: "F",
            refund: refundDone,
        });
        const r = await failMatchingAction({
            reservationId: "R",
            reason: "파트너 없음",
            confirmed: true,
        });
        expect(r.ok && r.message).toContain("전액 환불까지 완료");
    });

    it("never calls a PG failure a completed refund", async () => {
        mock.fail.mockResolvedValue({
            ok: true,
            refundId: "F",
            refund: { ok: false, code: "GATEWAY_FAILED", message: "x" },
        });
        const r = await failMatchingAction({
            reservationId: "R",
            reason: "파트너 없음",
            confirmed: true,
        });
        expect(r.ok && r.message).toContain("끝나지 않았습니다");
        expect(r.ok && r.message).not.toContain("완료했습니다");
    });

    it("passes failures of the begin step through", async () => {
        mock.fail.mockResolvedValue({ ok: false, message: "실패" });
        const r = await failMatchingAction({
            reservationId: "R",
            reason: "파트너 없음",
            confirmed: true,
        });
        expect(r.ok).toBe(false);
    });

    it("retries a failed refund through the same path", async () => {
        mock.retry.mockResolvedValue({
            ok: true,
            refundId: "F",
            refund: refundDone,
        });
        expect((await retryRefundAction({ reservationId: "R" })).ok).toBe(true);
        mock.retry.mockResolvedValue({ ok: false, message: "처리 중" });
        expect((await retryRefundAction({ reservationId: "R" })).ok).toBe(
            false,
        );
    });

    it("records the failure notice separately from the refund", async () => {
        mock.rpc.mockResolvedValue({
            data: "2026-11-20T00:00:00Z",
            error: null,
        });
        const r = await recordFailureNoticeAction({
            reservationId: "R",
            method: "PHONE",
            confirmed: true,
            memo: "통화",
        });
        expect(r.ok).toBe(true);
        expect(mock.rpc).toHaveBeenCalledWith("admin_record_failure_notice", {
            p_reservation: "R",
            p_method: "PHONE",
            p_memo: "통화",
        });
        expect(mock.fail).not.toHaveBeenCalled();
        expect(
            (
                await recordFailureNoticeAction({
                    reservationId: "R",
                    method: "PHONE",
                    confirmed: false,
                })
            ).ok,
        ).toBe(false);
    });
});

describe("resendIntakeEmailAction", () => {
    it("does not resend an already sent intake", async () => {
        mock.rpc.mockResolvedValue({ data: "ALREADY_SENT", error: null });
        const r = await resendIntakeEmailAction({ reservationId: "R" });
        expect(r.ok && r.message).toContain("다시 보내지 않았");
        expect(mock.dispatch).not.toHaveBeenCalled();
    });

    it("requeues then dispatches immediately", async () => {
        mock.rpc.mockResolvedValue({ data: "REQUEUED", error: null });
        mock.dispatch.mockResolvedValue({ claimed: 1, sent: 1, failed: 0 });
        const r = await resendIntakeEmailAction({ reservationId: "R" });
        expect(r.ok).toBe(true);
        expect(mock.dispatch).toHaveBeenCalledTimes(1);
    });

    it("does not report success when email is not configured (mock send)", async () => {
        mock.rpc.mockResolvedValue({ data: "REQUEUED", error: null });
        mock.dispatch.mockResolvedValue({
            claimed: 0,
            sent: 0,
            failed: 0,
            skipped: "EMAIL_NOT_CONFIGURED",
        });
        expect((await resendIntakeEmailAction({ reservationId: "R" })).ok).toBe(
            false,
        );
    });

    it("reports a send failure", async () => {
        mock.rpc.mockResolvedValue({ data: "REQUEUED", error: null });
        mock.dispatch.mockResolvedValue({ claimed: 1, sent: 0, failed: 1 });
        expect((await resendIntakeEmailAction({ reservationId: "R" })).ok).toBe(
            false,
        );
    });
});

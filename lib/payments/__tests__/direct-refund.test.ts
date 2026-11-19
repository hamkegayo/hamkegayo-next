import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentGatewayError } from "@/lib/payments/types";

const mock = vi.hoisted(() => ({
    rpc: vi.fn(),
    cancel: vi.fn(),
    incident: vi.fn(),
}));
vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: () => ({ rpc: mock.rpc }),
}));
vi.mock("@/lib/payments/nicepay", () => ({
    getPaymentGateway: () => ({ cancel: mock.cancel }),
}));
vi.mock("@/lib/payments/incident", () => ({ reportIncident: mock.incident }));

import {
    cancelBeforeAssignment,
    executeDirectRefund,
    failMatchingAndRefund,
} from "@/lib/payments/direct-refund";

// 배정 전 전액 환불 (#300). PG·DB 는 모의한다. 상태 전이·원장은 scripts/test-direct-assignment.sql 이 검증한다.
const claim = (over: Record<string, unknown> = {}) => ({
    proceed: true,
    status: "PROCESSING",
    pg_done: false,
    amount_cash: 40000,
    order_id: "ORDER-1",
    transaction_id: "TID-1",
    payment_id: "PAY-1",
    reservation_code: "R-1",
    ...over,
});
const called = (name: string) => mock.rpc.mock.calls.some(([n]) => n === name);

function setup(
    claimed: unknown,
    complete: unknown = { already: false, cash: 40000, restored_points: 0 },
) {
    mock.rpc.mockImplementation(async (name: string) => {
        if (name === "claim_direct_refund")
            return { data: claimed, error: null };
        if (name === "complete_direct_refund")
            return complete instanceof Error
                ? { data: null, error: { message: complete.message } }
                : { data: complete, error: null };
        return { data: null, error: null };
    });
}

beforeEach(() => vi.resetAllMocks());

describe("executeDirectRefund", () => {
    it("cancels the whole payment at the PG, then records the ledger", async () => {
        setup(claim());
        mock.cancel.mockResolvedValue({ raw: { ok: true } });
        const out = await executeDirectRefund("RF-1", "사유");
        expect(out).toMatchObject({ ok: true, cash: 40000, already: false });
        // 전액 취소 — 금액을 싣지 않는다
        expect(mock.cancel).toHaveBeenCalledWith({
            transactionId: "TID-1",
            orderId: "ORDER-1",
            reason: "사유",
        });
        expect(called("mark_direct_refund_pg_done")).toBe(true);
        expect(called("complete_direct_refund")).toBe(true);
    });

    it("never marks the refund complete when the PG cancel fails", async () => {
        setup(claim());
        mock.cancel.mockRejectedValue(new PaymentGatewayError("거절", "E1"));
        const out = await executeDirectRefund("RF-1", "사유");
        expect(out).toMatchObject({ ok: false, code: "GATEWAY_FAILED" });
        expect(called("fail_direct_refund")).toBe(true);
        expect(called("complete_direct_refund")).toBe(false);
        expect(mock.incident).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "REFUND_FAILED", amount: 40000 }),
        );
    });

    it("does not call the PG again when the cancel already succeeded earlier", async () => {
        setup(claim({ pg_done: true }));
        const out = await executeDirectRefund("RF-1", "사유");
        expect(out.ok).toBe(true);
        expect(mock.cancel).not.toHaveBeenCalled();
        expect(called("complete_direct_refund")).toBe(true);
    });

    it("does not call the PG twice while another request holds the lease", async () => {
        setup({ proceed: false, status: "PROCESSING" });
        const out = await executeDirectRefund("RF-1", "사유");
        expect(out).toMatchObject({ ok: false, code: "IN_PROGRESS" });
        expect(mock.cancel).not.toHaveBeenCalled();
    });

    it("treats an already refunded row as done without touching the PG", async () => {
        setup({ proceed: false, status: "REFUNDED" });
        const out = await executeDirectRefund("RF-1", "사유");
        expect(out).toMatchObject({ ok: true, already: true });
        expect(mock.cancel).not.toHaveBeenCalled();
    });

    it("reports a record failure after the money went out and keeps it retryable", async () => {
        setup(claim(), new Error("db down"));
        mock.cancel.mockResolvedValue({ raw: null });
        const out = await executeDirectRefund("RF-1", "사유");
        expect(out).toMatchObject({ ok: false, code: "RECORD_FAILED" });
        expect(mock.incident).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "REFUND_RECORD_FAILED" }),
        );
        const failed = mock.rpc.mock.calls.find(
            ([n]) => n === "fail_direct_refund",
        );
        expect(failed?.[1].p_error).toMatch(/^RECORD_FAILED/);
    });

    it("fails safely when there is no PG transaction id to cancel", async () => {
        setup(claim({ transaction_id: null }));
        const out = await executeDirectRefund("RF-1", "사유");
        expect(out).toMatchObject({ ok: false, code: "GATEWAY_FAILED" });
        expect(mock.cancel).not.toHaveBeenCalled();
        expect(called("complete_direct_refund")).toBe(false);
    });

    it("skips the PG for a zero-cash refund (full coupon)", async () => {
        setup(claim({ amount_cash: 0 }), { already: false, cash: 0 });
        const out = await executeDirectRefund("RF-1", "사유");
        expect(out.ok).toBe(true);
        expect(mock.cancel).not.toHaveBeenCalled();
    });
});

describe("entry points use the caller session for authority", () => {
    const session = (result: unknown) => ({
        rpc: vi.fn().mockResolvedValue(result),
    });

    it("customer cancel opens the refund through the owner RPC, then executes it", async () => {
        const user = session({
            data: { refund_id: "RF-1", status: "REQUESTED" },
            error: null,
        });
        setup(claim());
        mock.cancel.mockResolvedValue({ raw: null });
        const out = await cancelBeforeAssignment(user as never, "RES-1");
        expect(user.rpc).toHaveBeenCalledWith(
            "customer_cancel_before_assignment",
            { p_reservation: "RES-1" },
        );
        expect(out.ok && out.refund.ok).toBe(true);
    });

    it("explains an already assigned reservation without any PG call", async () => {
        const user = session({
            data: null,
            error: { code: "23514", message: "x" },
        });
        const out = await cancelBeforeAssignment(user as never, "RES-1");
        expect(out.ok).toBe(false);
        expect(mock.cancel).not.toHaveBeenCalled();
    });

    it("rejects a non-admin session before any refund is created", async () => {
        const user = session({
            data: null,
            error: { code: "42501", message: "forbidden" },
        });
        const out = await failMatchingAndRefund(
            user as never,
            "RES-1",
            "매칭 불가 사유",
        );
        expect(out).toEqual({ ok: false, message: "권한이 없습니다." });
        expect(mock.rpc).not.toHaveBeenCalled();
    });
});

import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 오픈 이벤트 쿠폰 결제의 승인 라우트 분기 (#297, #298 리뷰 5).
// PG·DB 는 모의한다. DB 트리거 자체는 scripts/test-opening-event.sql 이 검증한다.
const mock = vi.hoisted(() => ({
    payment: vi.fn(),
    update: vi.fn(),
    rpc: vi.fn(),
    approve: vi.fn(),
    cancel: vi.fn(),
    netCancel: vi.fn(),
    incident: vi.fn(),
}));
vi.mock("@/lib/payments/nicepay", () => ({
    parseAuthResult: () => ({
        ok: true,
        code: "0000",
        message: "",
        transactionId: "TID-1",
        orderId: "ORDER-1",
        amount: mock.payment().gross_amount - mock.payment().discount_amount,
        authToken: "token",
        signature: "signature",
    }),
    getPaymentGateway: () => ({
        verifyAuthResult: () => true,
        approve: mock.approve,
        cancel: mock.cancel,
        netCancel: mock.netCancel,
    }),
}));
vi.mock("@/lib/payments/incident", () => ({ reportIncident: mock.incident }));
vi.mock("@/lib/reservation-window", () => ({
    ADVANCE_RESERVATION_ERROR_CODE: "RESERVATION_DATE_OUT_OF_RANGE",
    isBeyondAdvanceReservationWindow: () => false,
}));
vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: table === "payments" ? mock.payment() : null,
                        error: null,
                    }),
                }),
            }),
            update: (values: unknown) => ({
                eq: async (_column: string, id: string) => {
                    mock.update(table, values, id);
                    return { error: null };
                },
            }),
            insert: async () => ({ error: null }),
        }),
        rpc: mock.rpc,
    }),
}));
import { POST } from "../route";

const request = {
    formData: async () => new FormData(),
    nextUrl: new URL("http://localhost/api/payments/confirm"),
} as unknown as NextRequest;

/** Basic 2시간 40,000원. 쿠폰이 있으면 20,000원을 할인한다. */
function pendingPayment(coupon: number) {
    return {
        id: "PAY-1",
        reservation_id: "RES-1",
        type: "BASE",
        status: "PENDING",
        gross_amount: 40000,
        discount_amount: coupon,
        campaign_discount_amount: coupon,
        token_expires_at: null,
        reservations: {
            id: "RES-1",
            code: "R-0001",
            status: "MATCHING",
            confirmed_partner_id: "PARTNER-1",
            payment_deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
            use_date: "2026-12-31",
        },
    };
}

function setup({
    coupon,
    ended,
    finalizeError = null,
}: {
    coupon: number;
    ended: boolean;
    finalizeError?: string | null;
}) {
    mock.payment.mockReturnValue(pendingPayment(coupon));
    mock.approve.mockResolvedValue({
        transactionId: "TID-1",
        orderId: "ORDER-1",
        amount: 40000 - coupon,
        status: "PAID",
        paidAt: "2026-12-31T14:59:59Z",
        receiptUrl: null,
        balanceAmount: null,
        raw: {},
    });
    mock.rpc.mockImplementation(async (name: string) => {
        if (name === "opening_event_status")
            return {
                data: [{ enabled: !ended, remaining: 3, ended }],
                error: null,
            };
        if (name === "finalize_payment")
            return {
                error: finalizeError ? { message: finalizeError } : null,
            };
        return { data: null, error: null };
    });
}

async function confirm() {
    const response = await POST(request);
    expect(response.status).toBe(303);
    return new URL(response.headers.get("location")!);
}

const calledRpc = (name: string) =>
    mock.rpc.mock.calls.some(([called]) => called === name);
const failedPayment = () =>
    mock.update.mock.calls.some(
        ([table, values, id]) =>
            table === "payments" &&
            (values as { status?: string }).status === "FAILED" &&
            id === "PAY-1",
    );

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("opening coupon payment confirmation", () => {
    it("stops an ended coupon payment before PG approval", async () => {
        setup({ coupon: 20000, ended: true });
        const location = await confirm();
        expect(location.searchParams.get("pay")).toBe("fail");
        expect(location.searchParams.get("code")).toBe("COUPON_ENDED");
        expect(location.searchParams.get("rid")).toBe("RES-1");
        expect(mock.approve).not.toHaveBeenCalled();
        expect(mock.netCancel).toHaveBeenCalledWith({ orderId: "ORDER-1" });
        expect(calledRpc("finalize_payment")).toBe(false);
        expect(calledRpc("release_points")).toBe(true);
        expect(failedPayment()).toBe(true);
        expect(mock.incident).not.toHaveBeenCalled();
    });

    it("cancels without an incident when the trigger rejects an ended coupon", async () => {
        // 승인 전 검사를 통과한 뒤 확정 사이에 종료 시각이 지난 경합 구간
        setup({ coupon: 20000, ended: false, finalizeError: "campaign_ended" });
        const location = await confirm();
        expect(location.searchParams.get("code")).toBe("COUPON_ENDED");
        expect(mock.approve).toHaveBeenCalledOnce();
        expect(mock.cancel).toHaveBeenCalledWith(
            expect.objectContaining({
                transactionId: "TID-1",
                reason: "이벤트 기간 종료로 쿠폰 미적용 자동 취소",
            }),
        );
        expect(failedPayment()).toBe(true);
        expect(mock.incident).not.toHaveBeenCalled();
    });

    it("keeps the incident for an exhausted coupon and other confirmation failures", async () => {
        setup({ coupon: 20000, ended: false, finalizeError: "campaign_full" });
        expect((await confirm()).searchParams.get("code")).toBe(
            "COUPON_EXHAUSTED",
        );
        expect(mock.incident).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "FINALIZE_FAILED" }),
        );

        vi.resetAllMocks();
        setup({ coupon: 20000, ended: false, finalizeError: "confirm failed" });
        expect((await confirm()).searchParams.get("code")).toBe(
            "CONFIRM_FAILED",
        );
        expect(mock.cancel).toHaveBeenCalledWith(
            expect.objectContaining({ reason: "예약 확정 실패로 자동 취소" }),
        );
        expect(mock.incident).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "FINALIZE_FAILED" }),
        );
    });

    it("does not check the campaign for a payment without the coupon", async () => {
        setup({ coupon: 0, ended: true });
        const location = await confirm();
        expect(location.searchParams.get("pay")).toBe("done");
        expect(calledRpc("opening_event_status")).toBe(false);
        expect(mock.approve).toHaveBeenCalledOnce();
        expect(calledRpc("finalize_payment")).toBe(true);
    });
});

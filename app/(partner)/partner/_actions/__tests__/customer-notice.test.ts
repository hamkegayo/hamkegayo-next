import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        rpc: mock.rpc,
        auth: { getUser: mock.getUser },
    }),
}));

import { recordCustomerNotice } from "../customer-notice";

beforeEach(() => {
    vi.resetAllMocks();
    mock.getUser.mockResolvedValue({ data: { user: { id: "P" } } });
    mock.rpc.mockResolvedValue({ data: "2026-11-20T00:00:00Z", error: null });
});

describe("recordCustomerNotice", () => {
    it("records completion with an optional memo; the partner id is never sent", async () => {
        const r = await recordCustomerNotice({
            reservationId: "R",
            memo: " 문자 보냄 ",
        });
        expect(r.ok).toBe(true);
        expect(mock.rpc).toHaveBeenCalledWith(
            "partner_record_customer_notice",
            {
                p_reservation: "R",
                p_memo: "문자 보냄",
            },
        );
    });

    it("works without a memo", async () => {
        await recordCustomerNotice({ reservationId: "R" });
        expect(mock.rpc).toHaveBeenCalledWith(
            "partner_record_customer_notice",
            {
                p_reservation: "R",
                p_memo: undefined,
            },
        );
    });

    it("rejects an over-long memo before the DB", async () => {
        const r = await recordCustomerNotice({
            reservationId: "R",
            memo: "가".repeat(501),
        });
        expect(r.ok).toBe(false);
        expect(mock.rpc).not.toHaveBeenCalled();
    });

    it("explains a reassigned/non-assigned partner refusal", async () => {
        mock.rpc.mockResolvedValue({
            data: null,
            error: { message: "not_assigned_partner", code: "42501" },
        });
        const r = await recordCustomerNotice({ reservationId: "R" });
        expect(!r.ok && r.message).toContain("담당 파트너");
    });

    it("explains an expired access window", async () => {
        mock.rpc.mockResolvedValue({
            data: null,
            error: { message: "access_expired", code: "42501" },
        });
        const r = await recordCustomerNotice({ reservationId: "R" });
        expect(!r.ok && r.message).toContain("열람 기간");
    });

    it("requires a session", async () => {
        mock.getUser.mockResolvedValue({ data: { user: null } });
        expect((await recordCustomerNotice({ reservationId: "R" })).ok).toBe(
            false,
        );
    });
});

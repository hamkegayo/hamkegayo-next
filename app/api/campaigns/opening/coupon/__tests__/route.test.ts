import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
    user: { id: "local-user" } as { id: string } | null,
    status: vi.fn(),
    ensure: vi.fn(),
    rpc: vi.fn(),
}));
vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mock.user } }) },
        rpc: mock.rpc,
    }),
}));
vi.mock("@/lib/opening-event-email.server", () => ({
    openingEventEmailStatus: mock.status,
    ensureOpeningEventEmail: mock.ensure,
}));
import { GET } from "../route";

beforeEach(() => {
    vi.resetAllMocks();
    mock.user = { id: "local-user" };
    mock.status.mockResolvedValue("registered");
});

const coupon = (data: Record<string, unknown>) =>
    mock.rpc.mockResolvedValue({ data, error: null });

describe("GET /api/campaigns/opening/coupon", () => {
    it.each(["HIDDEN", "EXHAUSTED", "CLOSED", "WAITING", "PAUSED", "USED"])(
        "passes through %s",
        async (state) => {
            coupon({ state, discount: 20000 });
            const res = await GET();
            expect(res.headers.get("Cache-Control")).toBe("no-store");
            expect(await res.json()).toMatchObject({ state, discount: 20000 });
            expect(mock.rpc).toHaveBeenCalledWith("opening_event_coupon");
        },
    );

    it("returns 401 with HIDDEN for anonymous users", async () => {
        mock.user = null;
        const res = await GET();
        expect(res.status).toBe(401);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(await res.json()).toEqual({
            state: "HIDDEN",
            discount: 0,
            ended: false,
        });
        expect(mock.rpc).not.toHaveBeenCalled();
    });

    it.each(["missing", "unavailable"])(
        "never reports AVAILABLE/HELD when email is %s, and never registers",
        async (emailStatus) => {
            mock.status.mockResolvedValue(emailStatus);
            for (const state of ["AVAILABLE", "HELD"]) {
                coupon({ state, discount: 20000 });
                expect(await (await GET()).json()).toMatchObject({
                    state: "PAUSED",
                });
            }
            expect(mock.ensure).not.toHaveBeenCalled();
        },
    );

    it("keeps discounts and marks CLOSED as ended", async () => {
        coupon({
            state: "CLOSED",
            discount: 20000,
            discounts: { basic: 20000, plus: 25000 },
        });
        expect(await (await GET()).json()).toMatchObject({
            state: "CLOSED",
            ended: true,
            discounts: { basic: 20000, plus: 25000 },
        });
    });

    it("hides on rpc error", async () => {
        mock.rpc.mockResolvedValue({ data: null, error: { message: "x" } });
        const res = await GET();
        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ state: "HIDDEN" });
    });
});

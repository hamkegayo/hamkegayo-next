import type { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ register: vi.fn(), rpc: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        auth: {
            getUser: async () => ({ data: { user: { id: "local-user" } } }),
        },
        rpc: mock.rpc,
    }),
}));
vi.mock("@/lib/opening-event-email.server", () => ({
    openingEventEmailStatus: mock.register,
}));
import { GET } from "../route";

beforeEach(() => vi.resetAllMocks());
const request = {
    nextUrl: new URL(
        "http://localhost/api/campaigns/opening/offer?rid=00000000-0000-4000-8000-000000000001",
    ),
} as NextRequest;
it("unregistered email overrides an existing available identity", async () => {
    mock.register.mockResolvedValue("missing");
    mock.rpc.mockResolvedValue({
        data: { eligible: true, state: "AVAILABLE", discount: 25000 },
        error: null,
    });
    expect(await (await GET(request)).json()).toMatchObject({
        eligible: false,
        state: "PAUSED",
    });
});
it("unavailable email preserves closed campaign status", async () => {
    mock.register.mockResolvedValue("unavailable");
    mock.rpc.mockResolvedValue({
        data: { eligible: false, state: "CLOSED", discount: 25000 },
        error: null,
    });
    expect(await (await GET(request)).json()).toMatchObject({
        eligible: false,
        state: "CLOSED",
    });
});
it("registered email returns the trusted offer", async () => {
    mock.register.mockResolvedValue("registered");
    mock.rpc.mockResolvedValue({
        data: { eligible: true, state: "AVAILABLE", discount: 25000 },
        error: null,
    });
    expect(await (await GET(request)).json()).toMatchObject({
        eligible: true,
        state: "AVAILABLE",
        discount: 25000,
    });
});
it("rpc error returns 500 with failed flag so UI does not show HIDDEN notice", async () => {
    mock.register.mockResolvedValue("registered");
    mock.rpc.mockResolvedValue({
        data: null,
        error: { message: "db error" },
    });
    const res = await GET(request);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
        eligible: false,
        state: "HIDDEN",
        discount: 0,
        failed: true,
    });
});

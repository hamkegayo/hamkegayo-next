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
    ensureOpeningEventEmail: mock.register,
}));
import { GET } from "../route";

beforeEach(() => vi.resetAllMocks());
const request = {
    nextUrl: new URL(
        "http://localhost/api/campaigns/opening/offer?rid=00000000-0000-4000-8000-000000000001",
    ),
} as NextRequest;
it("registration failure overrides an existing available identity", async () => {
    mock.register.mockResolvedValue(false);
    mock.rpc.mockResolvedValue({
        data: { eligible: true, state: "AVAILABLE", discount: 25000 },
        error: null,
    });
    expect(await (await GET(request)).json()).toMatchObject({
        eligible: false,
        state: "PAUSED",
    });
});
it("registration failure preserves closed campaign status", async () => {
    mock.register.mockResolvedValue(false);
    mock.rpc.mockResolvedValue({
        data: { eligible: false, state: "CLOSED", discount: 25000 },
        error: null,
    });
    expect(await (await GET(request)).json()).toMatchObject({
        eligible: false,
        state: "CLOSED",
    });
});
it("successful registration returns the trusted offer", async () => {
    mock.register.mockResolvedValue(true);
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

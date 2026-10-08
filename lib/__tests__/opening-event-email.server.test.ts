import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openingEventEmailHash } from "../opening-event-email-hash";

const mock = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: () => ({
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: mock.read }) }),
        }),
        rpc: mock.rpc,
    }),
}));
import { ensureOpeningEventEmail } from "../opening-event-email.server";

const key = "local-test-hmac-key-32-characters-only";
const user = {
    id: "local-test-user",
    email: "test@example.invalid",
    email_confirmed_at: "2026-01-01T00:00:00Z",
} as User;
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENING_EVENT_EMAIL_HMAC_KEY", key);
});
afterEach(() => vi.unstubAllEnvs());
it("existing current identity is read without RPC writes", async () => {
    mock.read.mockResolvedValue({
        data: {
            identity_hash: openingEventEmailHash(user.email!, key),
            verification_source: "SUPABASE_EMAIL",
            verified_at: "2026-01-01T00:00:00Z",
        },
        error: null,
    });
    expect(await ensureOpeningEventEmail(user)).toBe(true);
    expect(await ensureOpeningEventEmail(user)).toBe(true);
    expect(mock.rpc).not.toHaveBeenCalled();
});
it("missing identity registers once through trusted RPC", async () => {
    mock.read.mockResolvedValue({ data: null, error: null });
    mock.rpc.mockResolvedValue({ error: null });
    expect(await ensureOpeningEventEmail(user)).toBe(true);
    expect(mock.rpc).toHaveBeenCalledOnce();
});
it("missing key and failed registration are not eligible", async () => {
    vi.stubEnv("OPENING_EVENT_EMAIL_HMAC_KEY", "");
    expect(await ensureOpeningEventEmail(user)).toBe(false);
    vi.stubEnv("OPENING_EVENT_EMAIL_HMAC_KEY", key);
    mock.read.mockResolvedValue({ data: null, error: null });
    mock.rpc.mockResolvedValue({ error: { message: "unavailable" } });
    expect(await ensureOpeningEventEmail(user)).toBe(false);
});

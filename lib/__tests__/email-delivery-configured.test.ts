import { afterEach, describe, expect, it, vi } from "vitest";

import { isEmailDeliveryConfigured } from "@/lib/email";

afterEach(() => vi.unstubAllEnvs());

describe("isEmailDeliveryConfigured (mock send is never a success)", () => {
    it("is false in production when the key is missing or blank", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("RESEND_API_KEY", "");
        expect(isEmailDeliveryConfigured()).toBe(false);
        vi.stubEnv("RESEND_API_KEY", "   ");
        expect(isEmailDeliveryConfigured()).toBe(false);
    });
    it("is true only with a key", () => {
        vi.stubEnv("RESEND_API_KEY", "test-key");
        expect(isEmailDeliveryConfigured()).toBe(true);
    });
});

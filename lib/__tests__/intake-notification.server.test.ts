import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
    rpc: vi.fn(),
    send: vi.fn(),
    configured: vi.fn(),
}));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: () => ({ rpc: mock.rpc }),
}));
vi.mock("@/lib/email", () => ({
    getEmailSender: () => ({ send: mock.send }),
    isEmailDeliveryConfigured: mock.configured,
}));

import {
    buildIntakeEmail,
    dispatchIntakeNotificationForReservation,
    dispatchIntakeNotifications,
    intakeRecipients,
} from "@/lib/intake-notification.server";

const claimed = [
    { intake_id: "I-1", reservation_id: "RES-1", reservation_code: "R-1" },
    { intake_id: "I-2", reservation_id: "RES-2", reservation_code: "R-2" },
];
const recorded = () =>
    mock.rpc.mock.calls
        .filter(([name]) => name === "record_intake_notification_result")
        .map(([, args]) => args);

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("PAYMENT_ALERT_EMAIL", "ops@example.invalid");
    mock.configured.mockReturnValue(true);
    mock.rpc.mockImplementation(async (name: string) =>
        name === "claim_intake_notifications"
            ? { data: claimed, error: null }
            : { data: null, error: null },
    );
    mock.send.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("operator intake email", () => {
    it("carries only the fact, the reservation code and an admin link", () => {
        const { subject, html } = buildIntakeEmail("https://example.test/", {
            id: "abc",
            code: "R-0001",
        });
        expect(subject).toContain("R-0001");
        expect(html).toContain(
            'href="https://example.test/admin/reservations/abc"',
        );
        // 일시·서비스·병원·성명·건강정보는 싣지 않는다
        expect(html).not.toMatch(/\d{2}:\d{2}|Basic|Plus|병원\s*:|성명|연락처/);
    });

    it("escapes the reservation code", () => {
        const { html } = buildIntakeEmail("https://example.test", {
            id: "x",
            code: "<b>",
        });
        expect(html).not.toContain("<b>");
    });

    it("splits recipients by comma or whitespace", () => {
        expect(intakeRecipients("a@x.test, b@x.test  c@x.test")).toEqual([
            "a@x.test",
            "b@x.test",
            "c@x.test",
        ]);
        expect(intakeRecipients(undefined)).toEqual([]);
    });
});

describe("dispatchIntakeNotifications", () => {
    it("sends each claimed intake once and records success", async () => {
        const result = await dispatchIntakeNotifications();
        expect(result).toEqual({ claimed: 2, sent: 2, failed: 0 });
        expect(mock.send).toHaveBeenCalledTimes(2);
        expect(recorded().map((a) => a.p_ok)).toEqual([true, true]);
    });

    it("records a failure so the queue retries with backoff", async () => {
        mock.send.mockRejectedValueOnce(new Error("Resend 발송 실패(500)"));
        const result = await dispatchIntakeNotifications();
        expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
        const [first, second] = recorded();
        expect(first).toMatchObject({ p_intake: "I-1", p_ok: false });
        expect(first.p_error).toContain("Resend");
        expect(second).toMatchObject({ p_intake: "I-2", p_ok: true });
    });

    it("does not treat the mock sender as a success", async () => {
        mock.configured.mockReturnValue(false);
        const result = await dispatchIntakeNotifications();
        expect(result.skipped).toBe("EMAIL_NOT_CONFIGURED");
        // 건을 집어 가지도(시도 횟수 소진) 기록하지도 않는다
        expect(mock.rpc).not.toHaveBeenCalled();
        expect(mock.send).not.toHaveBeenCalled();
    });

    it("skips quietly when no operator recipient is configured", async () => {
        vi.stubEnv("PAYMENT_ALERT_EMAIL", "");
        vi.stubEnv("INTAKE_ALERT_EMAIL", "");
        const result = await dispatchIntakeNotifications();
        expect(result.skipped).toBe("NO_RECIPIENT");
        expect(mock.rpc).not.toHaveBeenCalled();
        expect(mock.send).not.toHaveBeenCalled();
    });

    const sentTo = () => mock.send.mock.calls.map(([to]) => to).sort();

    it("uses PAYMENT_ALERT_EMAIL when only it is set", async () => {
        vi.stubEnv("INTAKE_ALERT_EMAIL", "");
        await dispatchIntakeNotifications();
        expect(new Set(sentTo())).toEqual(new Set(["ops@example.invalid"]));
    });

    it("uses only INTAKE_ALERT_EMAIL when only it is set", async () => {
        vi.stubEnv("PAYMENT_ALERT_EMAIL", "");
        vi.stubEnv(
            "INTAKE_ALERT_EMAIL",
            "a@example.invalid, b@example.invalid",
        );
        await dispatchIntakeNotifications();
        expect(new Set(sentTo())).toEqual(
            new Set(["a@example.invalid", "b@example.invalid"]),
        );
        expect(mock.send).toHaveBeenCalledTimes(4); // 2건 × 2명
    });

    it("sends to both and dedupes overlapping addresses when both are set", async () => {
        vi.stubEnv(
            "PAYMENT_ALERT_EMAIL",
            "Ops@Example.invalid, pay@example.invalid",
        );
        vi.stubEnv(
            "INTAKE_ALERT_EMAIL",
            " ops@example.invalid ,in@example.invalid",
        );
        await dispatchIntakeNotifications();
        // 2건 × 3명(ops 중복 제거)
        expect(mock.send).toHaveBeenCalledTimes(6);
        const perRow = sentTo().map((a) => a.toLowerCase());
        expect(perRow.filter((a) => a === "ops@example.invalid")).toHaveLength(
            2,
        );
        expect(new Set(perRow)).toEqual(
            new Set([
                "ops@example.invalid",
                "pay@example.invalid",
                "in@example.invalid",
            ]),
        );
    });

    it("does nothing when the queue is empty", async () => {
        mock.rpc.mockResolvedValue({ data: [], error: null });
        expect(await dispatchIntakeNotifications()).toEqual({
            claimed: 0,
            sent: 0,
            failed: 0,
        });
        expect(mock.send).not.toHaveBeenCalled();
    });

    it("claims and sends only the targeted reservation on manual resend", async () => {
        mock.rpc.mockImplementation(async (name: string) =>
            name === "claim_intake_notification_for_reservation"
                ? { data: [claimed[1]], error: null }
                : { data: null, error: null },
        );
        const result = await dispatchIntakeNotificationForReservation("RES-2");
        expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
        expect(mock.rpc).toHaveBeenCalledWith(
            "claim_intake_notification_for_reservation",
            { p_reservation: "RES-2" },
        );
        expect(mock.send).toHaveBeenCalledTimes(1);
        expect(mock.send.mock.calls[0][1]).toContain("R-2");
    });
});

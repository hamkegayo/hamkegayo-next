import { beforeEach, describe, expect, it, vi } from "vitest";

// 이용자 본인 동의 공개 액션 (처리방침 제10조 ①②④, #306)

const { mockRpc, mockAfter } = vi.hoisted(() => ({
    mockRpc: vi.fn(),
    mockAfter: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mockAfter }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: vi.fn(() => ({ rpc: mockRpc })),
}));
vi.mock("@/lib/partner-new-request.server", () => ({
    notifyPartnersOfNewRequest: vi.fn(async () => {}),
}));

import { PRIVACY } from "@/lib/legal/privacy";
import {
    generateConsentToken,
    hashConsentToken,
} from "@/lib/proxy-consent-token.server";
import {
    getConsentTokenState,
    submitUserConsent,
    verifyConsentIdentity,
} from "../_actions";

const { token } = generateConsentToken();

describe("본인 동의 공개 액션", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("형식이 다른 토큰은 DB 를 부르지 않고 NOT_FOUND", async () => {
        expect(await getConsentTokenState("bad")).toBe("NOT_FOUND");
        expect(
            await verifyConsentIdentity("bad", "1950-01-01", "1234"),
        ).toEqual({ ok: false, reason: "NOT_FOUND" });
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("본인 확인 입력이 올바르지 않으면 DB 를 부르지 않는다", async () => {
        expect(
            await verifyConsentIdentity(token, "1950-13-45", "1234"),
        ).toEqual({ ok: false, reason: "INVALID_INPUT" });
        expect(await verifyConsentIdentity(token, "1950-01-01", "12")).toEqual({
            ok: false,
            reason: "INVALID_INPUT",
        });
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("본인 확인 실패는 남은 시도 횟수만 알려주고 예약 정보를 주지 않는다", async () => {
        mockRpc.mockResolvedValue({
            data: [
                { result: "MISMATCH", attempts_left: 3, hospital_name: null },
            ],
            error: null,
        });
        const res = await verifyConsentIdentity(token, "1950-01-01", "9999");
        expect(res).toEqual({ ok: false, reason: "MISMATCH", attemptsLeft: 3 });
        expect(mockRpc.mock.calls[0][1].p_token_hash).toBe(
            hashConsentToken(token),
        );
    });

    it("본인 확인 성공 시 최소 예약 정보를 돌려준다", async () => {
        mockRpc.mockResolvedValue({
            data: [
                {
                    result: "OK",
                    attempts_left: 5,
                    plan: "basic",
                    use_date: "2026-12-30",
                    arrive_time: "09:00",
                    hospital_name: "테스트병원",
                    guardian_name: "보호자",
                    relation: "자녀",
                    expires_at: "2026-12-30T00:00:00Z",
                },
            ],
            error: null,
        });
        const res = await verifyConsentIdentity(token, "1950-01-01", "2222");
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.context.hospitalName).toBe("테스트병원");
            expect(Object.keys(res.context)).not.toContain("mobilityStatus");
        }
    });

    it("거동·인지 상태 제공에 동의하지 않으면 제출을 DB 로 보내지 않는다", async () => {
        const res = await submitUserConsent({
            token,
            birth: "1950-01-01",
            phoneLast4: "2222",
            agreeHealth: false,
            shareMedical: true,
        });
        expect(res).toEqual({ ok: false, reason: "HEALTH_CONSENT_REQUIRED" });
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("동의 제출은 해시·본인 확인 값·선택값·처리방침 버전을 RPC 로 보내고 알림을 예약한다", async () => {
        mockRpc.mockResolvedValue({
            data: [{ result: "OK", reservation_id: "res-1" }],
            error: null,
        });
        const res = await submitUserConsent({
            token,
            birth: "1950-01-01",
            phoneLast4: "2222",
            agreeHealth: true,
            shareMedical: false,
        });
        expect(res).toEqual({ ok: true });
        expect(mockRpc).toHaveBeenCalledWith("submit_user_consent", {
            p_token_hash: hashConsentToken(token),
            p_birth: "1950-01-01",
            p_phone_last4: "2222",
            p_agree_health: true,
            p_share_medical: false,
            p_policy_version: PRIVACY.version,
        });
        expect(mockAfter).toHaveBeenCalledTimes(1);
    });

    it("이미 사용했거나 만료된 토큰의 제출 실패는 알림을 예약하지 않는다", async () => {
        mockRpc.mockResolvedValue({
            data: [{ result: "USED", reservation_id: null }],
            error: null,
        });
        const res = await submitUserConsent({
            token,
            birth: "1950-01-01",
            phoneLast4: "2222",
            agreeHealth: true,
            shareMedical: true,
        });
        expect(res).toEqual({ ok: false, reason: "USED" });
        expect(mockAfter).not.toHaveBeenCalled();
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// 대리 예약 이용자 본인 동의 · 대리 동의 사유·권한 (개인정보처리방침 제10조 ①-④, #306)

const { mockInsert, mockSingle, mockRpc, mockGetUser, mockAfter, mockNotify } =
    vi.hoisted(() => {
        const mockSingle = vi.fn();
        const mockSelect = vi.fn(() => ({ single: mockSingle }));
        const mockInsert = vi.fn(() => ({ select: mockSelect }));
        return {
            mockInsert,
            mockSingle,
            mockRpc: vi.fn(),
            mockGetUser: vi.fn(),
            mockAfter: vi.fn(),
            mockNotify: vi.fn(async () => {}),
        };
    });

const adminDelete = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({ after: mockAfter }));
vi.mock("next/headers", () => ({
    headers: vi.fn(async () => new Headers({ host: "localhost:3000" })),
}));
vi.mock("@/utils/supabase/server", () => ({
    createClient: vi.fn(async () => ({
        auth: { getUser: mockGetUser },
        rpc: mockRpc,
        from: vi.fn(() => ({ insert: mockInsert })),
    })),
}));
vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: vi.fn(() => ({
        from: vi.fn(() => ({
            update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            })),
            delete: adminDelete,
        })),
    })),
}));
vi.mock("@/lib/address-token.server", () => ({
    verifiedRegionCode: vi.fn(() => "1168010100"),
}));
vi.mock("../quote.server", () => ({
    quoteReservation: vi.fn(async () => ({
        durationMinutes: 120,
        hourlyRate: 30000,
        feeRate: 0.2,
        surchargeRate: 0,
        amount: 60000,
    })),
}));
vi.mock("@/lib/partner-new-request.server", () => ({
    notifyPartnersOfNewRequest: mockNotify,
}));
vi.mock("@/lib/direct-assignment", () => ({
    newReservationMatchingMode: vi.fn(() => "legacy_auto"),
}));

import { kstToday } from "@/lib/format";
import { addCalendarDays } from "@/lib/reservation-window";
import { PRIVACY } from "@/lib/legal/privacy";
import { createReservation } from "../../_actions/reservation";
import { reservationServerSchema, step1Form } from "../schema";

const DETAIL = "치매 진단으로 의사능력이 제한되어 직접 동의가 어렵습니다.";

function step1(over: Record<string, unknown> = {}) {
    return {
        userName: "홍길동",
        userBirth: "1950-01-01",
        userGender: "male" as const,
        userPhone: "010-1234-5678",
        guardianName: "홍보호",
        guardianPhone: "010-9876-5432",
        relation: "자녀",
        treatment: "정형외과",
        purpose: "외래 진료",
        mobilityStatus: "부축 필요",
        cognitiveStatus: "의사소통 원활",
        notifyTarget: "BOTH" as const,
        shareMedicalInfo: true,
        agreePreMatchingHealth: false,
        ...over,
    };
}

function reservationInput(over: Record<string, unknown> = {}) {
    const useDate = addCalendarDays(kstToday(), 3) ?? "2099-01-01";
    return {
        ...step1(),
        plan: "basic" as const,
        useDate,
        arriveTime: "09:00",
        reserveTime: "10:00",
        duration: "2시간",
        departAddress: "서울특별시 강남구 역삼동 123-45",
        hospitalName: "테스트정형외과",
        hospitalAddress: "서울특별시 서초구 반포대로 58",
        transportTo: "TAXI" as const,
        transportHome: "TAXI" as const,
        endMethod: "INDEPENDENT" as const,
        ...over,
    };
}

const proxyFields = {
    consentMode: "GUARDIAN_PROXY" as const,
    proxyReasonCode: "LACKS_CAPACITY" as const,
    proxyReasonDetail: DETAIL,
    proxyAuthorityPledge: true,
    agreePreMatchingHealth: true,
};

function paths(parsed: ReturnType<typeof step1Form.safeParse>): string[] {
    return parsed.success
        ? []
        : parsed.error.issues.map((i) => String(i.path[0]));
}

describe("대리 예약 동의 스키마 (제10조 ①-③)", () => {
    it("본인 관계는 기존처럼 거동·인지 상태 동의만 필요하다", () => {
        expect(
            step1Form.safeParse(
                step1({ relation: "본인", agreePreMatchingHealth: true }),
            ).success,
        ).toBe(true);
        expect(
            paths(
                step1Form.safeParse(
                    step1({ relation: "본인", agreePreMatchingHealth: false }),
                ),
            ),
        ).toEqual(["agreePreMatchingHealth"]);
    });

    it("본인 관계는 대리 동의 입력이 있어도 무시한다", () => {
        expect(
            step1Form.safeParse(
                step1({
                    relation: "본인",
                    agreePreMatchingHealth: true,
                    consentMode: "GUARDIAN_PROXY",
                }),
            ).success,
        ).toBe(true);
    });

    it("대리 관계는 동의 방식을 골라야 한다", () => {
        expect(paths(step1Form.safeParse(step1()))).toContain("consentMode");
        expect(
            paths(step1Form.safeParse(step1({ consentMode: "" }))),
        ).toContain("consentMode");
    });

    it("본인 직접 동의는 이 화면의 건강정보 동의 없이 통과한다 (이용자가 링크에서 직접 동의)", () => {
        expect(
            step1Form.safeParse(
                step1({
                    consentMode: "USER_DIRECT",
                    agreePreMatchingHealth: false,
                }),
            ).success,
        ).toBe(true);
    });

    it("보호자 대리 동의는 사유·상세·권한 서약·건강정보 동의가 모두 필요하다", () => {
        expect(step1Form.safeParse(step1(proxyFields)).success).toBe(true);

        const missing = paths(
            step1Form.safeParse(
                step1({
                    consentMode: "GUARDIAN_PROXY",
                    agreePreMatchingHealth: false,
                }),
            ),
        );
        expect(missing).toEqual(
            expect.arrayContaining([
                "agreePreMatchingHealth",
                "proxyReasonCode",
                "proxyReasonDetail",
                "proxyAuthorityPledge",
            ]),
        );
    });

    it("대리 사유 상세는 공백 제외 10자 이상이어야 한다", () => {
        expect(
            paths(
                step1Form.safeParse(
                    step1({
                        ...proxyFields,
                        proxyReasonDetail: "   짧은 사유   ",
                    }),
                ),
            ),
        ).toEqual(["proxyReasonDetail"]);
    });

    it("허용되지 않은 사유 코드와 서약 미체크는 거절한다", () => {
        expect(
            step1Form.safeParse(step1({ ...proxyFields, proxyReasonCode: "X" }))
                .success,
        ).toBe(false);
        expect(
            paths(
                step1Form.safeParse(
                    step1({ ...proxyFields, proxyAuthorityPledge: false }),
                ),
            ),
        ).toEqual(["proxyAuthorityPledge"]);
    });

    it("서버 스키마도 같은 규칙을 적용한다 (화면 우회 방지)", () => {
        expect(
            reservationServerSchema.safeParse(reservationInput()).success,
        ).toBe(false);
        expect(
            reservationServerSchema.safeParse(
                reservationInput({ consentMode: "USER_DIRECT" }),
            ).success,
        ).toBe(true);
        expect(
            reservationServerSchema.safeParse(
                reservationInput({ ...proxyFields, proxyReasonDetail: "" }),
            ).success,
        ).toBe(false);
    });
});

describe("createReservation — 대리 예약 (제10조)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
        mockSingle.mockResolvedValue({
            data: { id: "res-1", code: "RES-001" },
            error: null,
        });
        mockRpc.mockImplementation(async (name: string) =>
            name === "issue_user_consent_token"
                ? { data: "2099-01-01T00:00:00.000Z", error: null }
                : { data: false, error: null },
        );
    });

    function inserted() {
        const calls = mockInsert.mock.calls as unknown[][];
        return calls[0]?.[0] as Record<string, unknown>;
    }

    it("본인 직접 동의: 대기 상태로 등록하고 민감정보 동의·진료내용 전달 동의는 비워 둔다", async () => {
        const res = await createReservation(
            reservationInput({ consentMode: "USER_DIRECT" }),
        );

        expect(res.ok).toBe(true);
        const row = inserted();
        expect(row.user_consent_mode).toBe("USER_DIRECT");
        expect(row.user_consent_status).toBe("PENDING_USER");
        expect(row.pre_matching_health_consented_at).toBeNull();
        expect(row.pre_matching_health_consent_version).toBeNull();
        expect(row.share_medical_info).toBe(false);
        expect(row.proxy_reason_code).toBeUndefined();
    });

    it("본인 직접 동의: 토큰 해시만 DB 로 보내고 원문 링크를 돌려준다", async () => {
        const res = await createReservation(
            reservationInput({ consentMode: "USER_DIRECT" }),
        );

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.consent?.status).toBe("PENDING_USER");
        expect(res.consent?.delivered).toBe(false); // 발송 계약 전 — 보호자가 직접 전달
        const link = res.consent?.link ?? "";
        expect(link).toMatch(
            /^https:\/\/example\.test\/consent\/[A-Za-z0-9_-]{43}$/,
        );

        const issue = mockRpc.mock.calls.find(
            (c) => c[0] === "issue_user_consent_token",
        );
        const args = issue?.[1] as Record<string, string>;
        expect(args.p_reservation_id).toBe("res-1");
        expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(args)).not.toContain(link.split("/").pop());
        expect(args.p_delivery_channel).toBe("MANUAL_LINK");
    });

    it("본인 직접 동의: 동의 전에는 파트너 새 요청 알림을 예약하지 않는다", async () => {
        await createReservation(
            reservationInput({ consentMode: "USER_DIRECT" }),
        );
        expect(mockAfter).not.toHaveBeenCalled();
    });

    it("본인 직접 동의: 링크 발급에 실패하면 예약을 지우고 실패를 돌려준다", async () => {
        const eq2 = vi.fn(async () => ({ error: null }));
        adminDelete.mockReturnValue({ eq: vi.fn(() => ({ eq: eq2 })) });
        mockRpc.mockImplementation(async (name: string) =>
            name === "issue_user_consent_token"
                ? { data: null, error: { message: "boom", code: "XX000" } }
                : { data: false, error: null },
        );

        const res = await createReservation(
            reservationInput({ consentMode: "USER_DIRECT" }),
        );
        expect(res).toMatchObject({ ok: false, reason: "error" });
        expect(adminDelete).toHaveBeenCalled();
    });

    it("보호자 대리 동의: 사유·권한 확인 서약 버전을 저장하고 진료내용 전달 동의는 false 로 고정한다", async () => {
        const res = await createReservation(reservationInput(proxyFields));

        expect(res).toMatchObject({ ok: true, matchingMode: "legacy_auto" });
        expect(res.ok && res.consent).toBeFalsy();
        const row = inserted();
        expect(row.user_consent_mode).toBe("GUARDIAN_PROXY");
        expect(row.user_consent_status).toBe("CONFIRMED");
        expect(row.proxy_reason_code).toBe("LACKS_CAPACITY");
        expect(row.proxy_reason_detail).toBe(DETAIL);
        expect(row.proxy_authority_version).toBe(PRIVACY.version);
        expect(row.share_medical_info).toBe(false);
        expect(row.pre_matching_health_consent_version).toBe(PRIVACY.version);
        // 서버가 시각을 넣지 않는다 — DB 트리거가 now() 로 기록한다
        expect(row).not.toHaveProperty("user_consent_confirmed_at");
        expect(row).not.toHaveProperty("proxy_authority_confirmed_at");
        expect(
            mockRpc.mock.calls.some((c) => c[0] === "issue_user_consent_token"),
        ).toBe(false);
        expect(mockAfter).toHaveBeenCalledTimes(1);
    });

    it("보호자 대리 동의: 사유나 서약이 없으면 DB 를 호출하지 않고 거절한다", async () => {
        for (const over of [
            { proxyReasonDetail: "" },
            { proxyAuthorityPledge: false },
            { proxyReasonCode: "" },
        ]) {
            const res = await createReservation(
                reservationInput({ ...proxyFields, ...over }),
            );
            expect(res).toMatchObject({ ok: false, reason: "validation" });
        }
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it("대리 관계인데 동의 방식을 보내지 않으면 거절한다", async () => {
        const res = await createReservation(reservationInput());
        expect(res).toMatchObject({ ok: false, reason: "validation" });
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it("본인 예약은 기존 흐름 그대로 SELF 로 등록하고 대리 필드를 보내지 않는다", async () => {
        const res = await createReservation(
            reservationInput({
                relation: "본인",
                agreePreMatchingHealth: true,
                consentMode: "GUARDIAN_PROXY",
                proxyReasonCode: "LACKS_CAPACITY",
                proxyReasonDetail: DETAIL,
            }),
        );
        expect(res).toMatchObject({ ok: true });
        const row = inserted();
        expect(row.user_consent_mode).toBe("SELF");
        expect(row.user_consent_status).toBe("NOT_REQUIRED");
        expect(row.share_medical_info).toBe(true); // 본인이 고른 값 그대로
        expect(row).not.toHaveProperty("proxy_reason_code");
        expect(mockAfter).toHaveBeenCalledTimes(1);
    });
});

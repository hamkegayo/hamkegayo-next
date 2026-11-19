import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInsert, mockSingle, mockRpc, mockGetUser, mockCreateClient } =
    vi.hoisted(() => {
        const mockSingle = vi.fn();
        const mockSelect = vi.fn(() => ({ single: mockSingle }));
        const mockInsert = vi.fn(() => ({ select: mockSelect }));
        const mockRpc = vi.fn();
        const mockGetUser = vi.fn();
        const mockCreateClient = vi.fn(async () => ({
            auth: { getUser: mockGetUser },
            rpc: mockRpc,
            from: vi.fn(() => ({ insert: mockInsert })),
        }));
        return {
            mockInsert,
            mockSingle,
            mockRpc,
            mockGetUser,
            mockCreateClient,
        };
    });

vi.mock("next/server", () => ({
    after: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
    createClient: mockCreateClient,
}));

vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: vi.fn(() => ({
        from: vi.fn(() => ({
            update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            })),
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
    notifyPartnersOfNewRequest: vi.fn(async () => {}),
}));

vi.mock("@/lib/direct-assignment", () => ({
    newReservationMatchingMode: vi.fn(() => "legacy_auto"),
}));

import { kstToday } from "@/lib/format";
import { addCalendarDays } from "@/lib/reservation-window";
import { PRIVACY } from "@/lib/legal/privacy";
import { createReservation } from "../../_actions/reservation";
import { reservationServerSchema, step1Schema } from "../schema";

const CONSENT_ERROR_MESSAGE =
    "거동·인지 상태의 매칭 전 파트너 제공에 동의하지 않으면 예약할 수 없습니다.";

function validStep1() {
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
        agreePreMatchingHealth: true,
    };
}

function validReservationInput() {
    const useDate = addCalendarDays(kstToday(), 3) ?? "2099-01-01";
    return {
        ...validStep1(),
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
    };
}

function withoutConsent<T extends { agreePreMatchingHealth?: boolean }>(
    input: T,
): Omit<T, "agreePreMatchingHealth"> {
    const copy = { ...input };
    delete copy.agreePreMatchingHealth;
    return copy;
}

describe("매칭 전 거동·인지 상태 제공 별도 동의 (#285)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
        mockRpc.mockResolvedValue({ data: false });
        mockSingle.mockResolvedValue({
            data: { id: "res-1", code: "RES-001" },
            error: null,
        });
    });

    describe("step1Schema", () => {
        it("agreePreMatchingHealth가 true이면 통과한다", () => {
            expect(step1Schema.safeParse(validStep1()).success).toBe(true);
        });

        it("agreePreMatchingHealth가 false이면 거절한다", () => {
            const parsed = step1Schema.safeParse({
                ...validStep1(),
                agreePreMatchingHealth: false,
            });
            expect(parsed.success).toBe(false);
            if (!parsed.success) {
                expect(
                    parsed.error.issues.some(
                        (i) =>
                            i.path[0] === "agreePreMatchingHealth" &&
                            i.message === CONSENT_ERROR_MESSAGE,
                    ),
                ).toBe(true);
            }
        });

        it("agreePreMatchingHealth가 누락되면 거절한다", () => {
            expect(
                step1Schema.safeParse(withoutConsent(validStep1())).success,
            ).toBe(false);
        });
    });

    describe("reservationServerSchema", () => {
        it("agreePreMatchingHealth가 true이면 통과한다", () => {
            expect(
                reservationServerSchema.safeParse(validReservationInput())
                    .success,
            ).toBe(true);
        });

        it("agreePreMatchingHealth가 false이거나 누락되면 거절한다", () => {
            expect(
                reservationServerSchema.safeParse({
                    ...validReservationInput(),
                    agreePreMatchingHealth: false,
                }).success,
            ).toBe(false);

            expect(
                reservationServerSchema.safeParse(
                    withoutConsent(validReservationInput()),
                ).success,
            ).toBe(false);
        });
    });

    describe("createReservation", () => {
        it("agreePreMatchingHealth가 false이면 validation 오류를 반환하고 DB insert를 호출하지 않는다", async () => {
            const res = await createReservation({
                ...validReservationInput(),
                agreePreMatchingHealth: false,
            });

            expect(res).toEqual({
                ok: false,
                reason: "validation",
                message: CONSENT_ERROR_MESSAGE,
            });
            expect(mockInsert).not.toHaveBeenCalled();
            expect(mockCreateClient).not.toHaveBeenCalled();
        });

        it("agreePreMatchingHealth가 누락되면 validation 오류를 반환하고 DB insert를 호출하지 않는다", async () => {
            const res = await createReservation(
                withoutConsent(validReservationInput()),
            );

            expect(res).toMatchObject({
                ok: false,
                reason: "validation",
            });
            expect(mockInsert).not.toHaveBeenCalled();
            expect(mockCreateClient).not.toHaveBeenCalled();
        });

        it("agreePreMatchingHealth가 true이면 동의 시각과 처리방침 버전을 함께 저장한다", async () => {
            const res = await createReservation(validReservationInput());

            expect(res).toEqual({
                ok: true,
                code: "RES-001",
                id: "res-1",
                matchingMode: "legacy_auto",
            });
            expect(mockInsert).toHaveBeenCalledTimes(1);
            const calls = mockInsert.mock.calls as unknown[][];
            const inserted = calls[0]?.[0] as
                Record<string, unknown> | undefined;
            expect(typeof inserted?.pre_matching_health_consented_at).toBe(
                "string",
            );
            expect(inserted?.pre_matching_health_consent_version).toBe(
                PRIVACY.version,
            );
        });
    });
});

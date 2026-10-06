import { describe, expect, it } from "vitest";

import {
    ACTIVITY_TIME_OPTIONS,
    EMPTY_ACTIVITY,
    activityTimeLabels,
    regionDisplayLabel,
    shortRegionLabel,
    validateActivity,
    type PartnerActivity,
} from "@/lib/partner-activity";

const REGIONS = new Set(["서울특별시", "서울특별시 강남구", "경기도 성남시"]);

function activity(patch: Partial<PartnerActivity>): PartnerActivity {
    return { ...EMPTY_ACTIVITY, ...patch };
}

// DB(마이그레이션 87)와 같은 규칙인지 화면 쪽에서도 고정한다 (#226).
describe("파트너 활동 정보 검증", () => {
    it("시간 선택지는 07:00~19:00, 30분 단위다 (약관 제13조 ③④)", () => {
        expect(ACTIVITY_TIME_OPTIONS[0]).toBe("07:00");
        expect(ACTIVITY_TIME_OPTIONS.at(-1)).toBe("19:00");
        expect(ACTIVITY_TIME_OPTIONS).toHaveLength(25);
    });

    it("빈 값과 정상 값은 통과한다", () => {
        expect(validateActivity(EMPTY_ACTIVITY, REGIONS)).toBeNull();
        expect(
            validateActivity(
                activity({
                    regions: ["서울특별시 강남구", "경기도 성남시"],
                    times: {
                        weekday: ["09:00", "15:00"],
                        saturday: null,
                        holiday: ["07:00", "19:00"],
                    },
                    transports: ["PUBLIC", "TAXI"],
                    mobility: ["휠체어 이용"],
                    hospitals: ["서울아산병원"],
                }),
                REGIONS,
            ),
        ).toBeNull();
    });

    it("목록 밖·중복 지역을 거부한다", () => {
        expect(
            validateActivity(
                activity({ regions: ["서울특별시 없는구"] }),
                REGIONS,
            ),
        ).toMatch("목록에 없는");
        expect(
            validateActivity(
                activity({ regions: ["서울특별시", "서울특별시"] }),
                REGIONS,
            ),
        ).toMatch("중복");
    });

    it("운영시간 밖·역순·30분 단위가 아닌 시간을 거부한다", () => {
        for (const range of [
            ["06:30", "12:00"],
            ["09:00", "19:30"],
            ["12:00", "09:00"],
            ["09:00", "09:00"],
            ["09:15", "12:00"],
        ] as [string, string][]) {
            expect(
                validateActivity(
                    activity({
                        times: {
                            weekday: range,
                            saturday: null,
                            holiday: null,
                        },
                    }),
                    REGIONS,
                ),
            ).toMatch("평일");
        }
    });

    it("파트너 운전·알 수 없는 보행 상태를 거부한다 (매뉴얼 2장)", () => {
        expect(
            validateActivity(
                activity({ transports: ["CAR" as never] }),
                REGIONS,
            ),
        ).toMatch("이동수단");
        expect(
            validateActivity(activity({ mobility: ["뛰기 가능"] }), REGIONS),
        ).toMatch("보행 보조");
    });

    it("선호 병원은 10곳·50자까지다", () => {
        expect(
            validateActivity(
                activity({
                    hospitals: Array.from({ length: 11 }, (_, i) => `병원${i}`),
                }),
                REGIONS,
            ),
        ).toMatch("10곳");
        expect(
            validateActivity(
                activity({ hospitals: ["가".repeat(51)] }),
                REGIONS,
            ),
        ).toMatch("50자");
        expect(
            validateActivity(activity({ hospitals: ["  "] }), REGIONS),
        ).toMatch("병원명");
    });
});

describe("활동 정보 표시", () => {
    it("요일별 시간을 쉬는 날 없이 나열한다", () => {
        expect(
            activityTimeLabels({
                weekday: ["09:00", "15:00"],
                saturday: null,
                holiday: ["10:00", "18:00"],
            }),
        ).toEqual(["평일 09:00~15:00", "일요일·공휴일 10:00~18:00"]);
    });

    it("시·도 이름을 짧게 줄인다", () => {
        expect(shortRegionLabel("서울특별시 강남구")).toBe("서울 강남구");
        expect(shortRegionLabel("경기도 성남시")).toBe("경기 성남시");
        expect(shortRegionLabel("강원특별자치도 춘천시")).toBe("강원 춘천시");
        expect(shortRegionLabel("세종특별자치시")).toBe("세종");
        expect(regionDisplayLabel("부산광역시")).toBe("부산 전체");
        expect(regionDisplayLabel("서울특별시 강남구")).toBe("서울 강남구");
    });
});

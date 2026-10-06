import { describe, expect, it } from "vitest";

import {
    ACTIVITY_TIME_OPTIONS,
    EMPTY_ACTIVITY,
    activityTimeLabels,
    addRegionSelection,
    coveredBySelection,
    regionDisplayLabel,
    shortRegionLabel,
    validateActivity,
    type ActivityRegion,
    type PartnerActivity,
} from "@/lib/partner-activity";

// 국토교통부 법정동코드 (경기도 4100000000 > 수원시 4111000000 > 장안구 4111100000 > 파장동 4111112900)
const GYEONGGI: ActivityRegion = {
    code: "4100000000",
    level: 1,
    name: "경기도",
    fullName: "경기도",
    ancestors: [],
};
const SUWON: ActivityRegion = {
    code: "4111000000",
    level: 2,
    name: "수원시",
    fullName: "경기도 수원시",
    ancestors: ["4100000000"],
};
const JANGAN: ActivityRegion = {
    code: "4111100000",
    level: 3,
    name: "장안구",
    fullName: "경기도 수원시 장안구",
    ancestors: ["4100000000", "4111000000"],
};
const PAJANG: ActivityRegion = {
    code: "4111112900",
    level: 4,
    name: "파장동",
    fullName: "경기도 수원시 장안구 파장동",
    ancestors: ["4100000000", "4111000000", "4111100000"],
};
const GANGNAM: ActivityRegion = {
    code: "1168000000",
    level: 2,
    name: "강남구",
    fullName: "서울특별시 강남구",
    ancestors: ["1100000000"],
};

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
        expect(validateActivity(EMPTY_ACTIVITY)).toBeNull();
        expect(
            validateActivity(
                activity({
                    regions: ["1168000000", "4113000000"],
                    times: {
                        weekday: ["09:00", "15:00"],
                        saturday: null,
                        holiday: ["07:00", "19:00"],
                    },
                    transports: ["PUBLIC", "TAXI"],
                    mobility: ["휠체어 이용"],
                    hospitals: ["서울아산병원"],
                }),
            ),
        ).toBeNull();
    });

    it("코드 형식이 아니거나 중복된 지역을 거부한다", () => {
        expect(
            validateActivity(activity({ regions: ["서울특별시 강남구"] })),
        ).toMatch("다시 선택");
        expect(
            validateActivity(
                activity({ regions: ["1100000000", "1100000000"] }),
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
                ),
            ).toMatch("평일");
        }
    });

    it("파트너 운전·알 수 없는 보행 상태를 거부한다 (매뉴얼 2장)", () => {
        expect(
            validateActivity(activity({ transports: ["CAR" as never] })),
        ).toMatch("이동수단");
        expect(validateActivity(activity({ mobility: ["뛰기 가능"] }))).toMatch(
            "보행 보조",
        );
    });

    it("선호 병원은 10곳·50자까지다", () => {
        expect(
            validateActivity(
                activity({
                    hospitals: Array.from({ length: 11 }, (_, i) => `병원${i}`),
                }),
            ),
        ).toMatch("10곳");
        expect(
            validateActivity(activity({ hospitals: ["가".repeat(51)] })),
        ).toMatch("50자");
        expect(validateActivity(activity({ hospitals: ["  "] }))).toMatch(
            "병원명",
        );
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
        expect(shortRegionLabel("전남광주통합특별시 목포시")).toBe(
            "전남광주 목포시",
        );
        expect(regionDisplayLabel("부산광역시", 1)).toBe("부산 전체");
        expect(regionDisplayLabel("강원특별자치도 원주시", 2)).toBe(
            "강원 원주시 전체",
        );
        expect(regionDisplayLabel("강원특별자치도 원주시 단계동", 4)).toBe(
            "강원 원주시 단계동",
        );
    });
});

describe("활동 지역 선택 정리 (상위는 하위 전체)", () => {
    it("상위를 고르면 이미 고른 하위가 빠진다", () => {
        expect(
            addRegionSelection([PAJANG, JANGAN, GANGNAM], SUWON).map(
                (r) => r.code,
            ),
        ).toEqual([GANGNAM.code, SUWON.code]);
    });

    it("상위가 이미 있으면 하위는 더하지 않는다", () => {
        const selected = [GYEONGGI];
        expect(addRegionSelection(selected, PAJANG)).toBe(selected);
        expect(coveredBySelection(selected, PAJANG)).toBe(true);
        expect(coveredBySelection([GANGNAM], PAJANG)).toBe(false);
    });

    it("같은 지역을 두 번 더하지 않는다", () => {
        expect(addRegionSelection([SUWON], SUWON)).toHaveLength(1);
    });
});

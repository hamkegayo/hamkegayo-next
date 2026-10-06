import { describe, expect, it } from "vitest";

import { EMPTY_ACTIVITY, type PartnerActivity } from "@/lib/partner-activity";
import {
    activityDayOf,
    matchRequest,
    type RequestForMatch,
} from "@/lib/partner-matching";

// 2026-10-07 수요일, 2026-10-10 토요일, 2026-10-11 일요일
const REQ: RequestForMatch = {
    useDate: "2026-10-07",
    arriveTime: "10시 00분",
    durationMinutes: 120,
    mobilityStatus: "휠체어 이용",
    hospitalName: "서울아산병원",
    isHoliday: false,
};

function activity(patch: Partial<PartnerActivity>): PartnerActivity {
    return { ...EMPTY_ACTIVITY, ...patch };
}

const NONE = { region: null, transport: null };

describe("요일 구분", () => {
    it("평일 / 토요일 / 일요일·공휴일", () => {
        expect(activityDayOf("2026-10-07", false)).toBe("weekday");
        expect(activityDayOf("2026-10-10", false)).toBe("saturday");
        expect(activityDayOf("2026-10-11", false)).toBe("holiday");
        expect(activityDayOf("2026-10-09", true)).toBe("holiday");
    });
});

describe("수락 대기 요청 매칭", () => {
    it("활동 정보가 없으면 판정하지 않는다 (지금처럼 이용일 순)", () => {
        expect(matchRequest(REQ, EMPTY_ACTIVITY, NONE)).toEqual({
            matched: false,
            hits: [],
            score: 0,
        });
    });

    it("설정한 필수 조건이 모두 맞으면 맞음", () => {
        const m = matchRequest(
            REQ,
            activity({
                times: {
                    weekday: ["09:00", "15:00"],
                    saturday: null,
                    holiday: null,
                },
                mobility: ["휠체어 이용"],
            }),
            { region: true, transport: true },
        );
        expect(m.matched).toBe(true);
        expect(m.hits).toEqual(["region", "time", "transport", "mobility"]);
    });

    it("하나라도 어긋나면 맞음이 아니지만 맞은 항목은 남긴다", () => {
        const m = matchRequest(
            REQ,
            activity({ mobility: ["스스로 보행 가능"] }),
            { region: true, transport: null },
        );
        expect(m.matched).toBe(false);
        expect(m.hits).toEqual(["region"]);
    });

    it("예상 종료가 활동 시간을 넘으면 시간 불일치", () => {
        const times = {
            weekday: ["09:00", "11:30"] as [string, string],
            saturday: null,
            holiday: null,
        };
        expect(matchRequest(REQ, activity({ times }), NONE).matched).toBe(
            false,
        );
        expect(
            matchRequest(
                { ...REQ, arriveTime: "09:00", durationMinutes: 150 },
                activity({ times }),
                NONE,
            ).matched,
        ).toBe(true);
    });

    it("평일만 활동하면 토요일 요청은 시간 불일치", () => {
        const m = matchRequest(
            { ...REQ, useDate: "2026-10-10" },
            activity({
                times: {
                    weekday: ["07:00", "19:00"],
                    saturday: null,
                    holiday: null,
                },
            }),
            NONE,
        );
        expect(m.matched).toBe(false);
    });

    it("선호 병원은 가산점이다 — 그것만으로는 맞음이 아니다", () => {
        const onlyHospital = matchRequest(
            { ...REQ, hospitalName: "서울아산병원 신관" },
            activity({ hospitals: ["서울 아산병원"] }),
            NONE,
        );
        expect(onlyHospital).toMatchObject({
            matched: false,
            hits: ["hospital"],
        });
        const withRegion = matchRequest(
            REQ,
            activity({ hospitals: ["서울아산병원"] }),
            { region: true, transport: null },
        );
        const regionOnly = matchRequest(REQ, EMPTY_ACTIVITY, {
            region: true,
            transport: null,
        });
        expect(withRegion.matched).toBe(true);
        expect(withRegion.score).toBeGreaterThan(regionOnly.score);
    });
});

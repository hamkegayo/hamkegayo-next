import { describe, expect, it } from "vitest";

import { EMPTY_ACTIVITY, applyPickedRegions } from "@/lib/partner-activity";
import type { ActivityRegion } from "@/lib/partner-activity";
import { resolveActivityLoad, type ActivityRow } from "../activity-load";

// #231 리뷰: 조회 실패를 "저장된 정보 없음"으로 바꾸면 저장 때 기존 값을 지운다.
const ROW: ActivityRow = {
    regions: ["5113000000", "1168000000"],
    weekday_start: "09:00:00",
    weekday_end: "15:00:00",
    saturday_start: null,
    saturday_end: null,
    holiday_start: null,
    holiday_end: null,
    transports: ["PUBLIC"],
    mobility_support: ["휠체어 이용"],
    preferred_hospitals: ["서울아산병원"],
};

const WONJU: ActivityRegion = {
    code: "5113000000",
    level: 2,
    name: "원주시",
    fullName: "강원특별자치도 원주시",
    ancestors: ["5100000000"],
};
const GANGNAM: ActivityRegion = {
    code: "1168000000",
    level: 2,
    name: "강남구",
    fullName: "서울특별시 강남구",
    ancestors: ["1100000000"],
};

describe("활동 정보 불러오기", () => {
    it("행 조회 실패는 빈 값이 아니라 실패다", () => {
        expect(
            resolveActivityLoad(
                { data: null, error: { message: "timeout" } },
                [],
            ),
        ).toEqual({ ok: false });
    });

    it("행이 실제로 없을 때만 빈 활동 정보다", () => {
        expect(resolveActivityLoad({ data: null, error: null }, [])).toEqual({
            ok: true,
            activity: EMPTY_ACTIVITY,
            regions: [],
            regionsUnavailable: false,
        });
    });

    it("지역 이름 조회가 실패해도 지역 코드는 그대로 둔다", () => {
        const load = resolveActivityLoad({ data: ROW, error: null }, null);
        expect(load).toMatchObject({ ok: true, regionsUnavailable: true });
        if (load.ok)
            expect(load.activity.regions).toEqual(["5113000000", "1168000000"]);
    });

    it("일부 지역 이름만 찾으면 나머지는 불러오지 못한 것으로 표시한다", () => {
        expect(
            resolveActivityLoad({ data: ROW, error: null }, [WONJU]),
        ).toMatchObject({ ok: true, regionsUnavailable: true });
        expect(
            resolveActivityLoad({ data: ROW, error: null }, [WONJU, GANGNAM]),
        ).toMatchObject({ ok: true, regionsUnavailable: false });
    });

    it("DB 시각을 HH:MM 으로 바꾼다", () => {
        const load = resolveActivityLoad({ data: ROW, error: null }, [
            WONJU,
            GANGNAM,
        ]);
        if (load.ok)
            expect(load.activity.times).toEqual({
                weekday: ["09:00", "15:00"],
                saturday: null,
                holiday: null,
            });
    });
});

describe("팝업 선택 적용", () => {
    it("이름을 모르는 기존 코드는 팝업 결과와 함께 남긴다", () => {
        expect(
            applyPickedRegions(
                [WONJU],
                ["5113000000", "1168000000"],
                new Set(["5113000000"]),
            ),
        ).toEqual(["5113000000", "1168000000"]);
    });

    it("이름을 아는 지역은 팝업에서 뺀 대로 지운다", () => {
        expect(
            applyPickedRegions(
                [WONJU],
                ["5113000000", "1168000000"],
                new Set(["5113000000", "1168000000"]),
            ),
        ).toEqual(["5113000000"]);
    });
});

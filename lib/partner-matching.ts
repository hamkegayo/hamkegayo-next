import {
    toMinutes,
    type ActivityDay,
    type PartnerActivity,
} from "@/lib/partner-activity";

/**
 * 파트너 수락 대기 목록의 "내 조건에 맞음" 판정 (#226 5단계).
 *
 * 처리방침 제1조 2호(파트너 매칭). 비교에 쓰는 예약 값은 단계 1 목록에 이미 있는 것뿐이고,
 * 지역·이동수단은 DB(partner_open_reservation_matches)가 참·거짓만 준다.
 *
 * 규칙 (사용자 결정 2026-10-06)
 *  - 지역·시간·이동수단·보행 상태는 파트너가 설정한 항목이 모두 맞아야 "맞음"이다.
 *  - 선호 병원은 가산점이다. 맞으면 표시하고 위로 올리지만 "맞음" 조건은 아니다.
 *  - 맞지 않는 요청도 숨기지 않는다. 설정이 없으면 지금처럼 이용일 순이다.
 */

/**
 * 목록에 "내 조건만 보기"를 적용할지 (#233 리뷰).
 * 판정 조회가 실패했으면 모든 요청의 match 가 null 이라 필터가 전부 숨기므로,
 * 그때는 필터를 적용하지 않고 전체를 이용일 순으로 보여 준다.
 */
export function applyMineFilter<
    T extends { match: { matched: boolean } | null },
>(
    items: T[],
    state: { activitySet: boolean; matchingAvailable: boolean; mine: boolean },
): { items: T[]; mineOnly: boolean } {
    const mineOnly = state.activitySet && state.matchingAvailable && state.mine;
    return {
        items: mineOnly ? items.filter((r) => r.match?.matched) : items,
        mineOnly,
    };
}

export type MatchKey =
    "region" | "time" | "transport" | "mobility" | "hospital";

export const MATCH_LABEL: Record<MatchKey, string> = {
    region: "지역",
    time: "시간",
    transport: "이동수단",
    mobility: "보행 상태",
    hospital: "선호 병원",
};

export type RequestForMatch = {
    useDate: string;
    /** "10:00" 또는 "10시 00분" */
    arriveTime: string;
    durationMinutes: number | null;
    mobilityStatus: string | null;
    hospitalName: string | null;
    /** 일요일이 아닌 공휴일·대체공휴일 */
    isHoliday: boolean;
};

export type ServerMatch = { region: boolean | null; transport: boolean | null };

export type RequestMatch = {
    /** 설정한 필수 조건이 하나 이상 있고 모두 맞음 */
    matched: boolean;
    /** 맞은 항목 (표시용, 선호 병원 포함) */
    hits: MatchKey[];
    /** 정렬 점수: 맞음 > 선호 병원 > 맞은 항목 수 */
    score: number;
};

const NO_MATCH: RequestMatch = { matched: false, hits: [], score: 0 };

function parseTime(time: string): number | null {
    const m = /^(\d{1,2})(?::([0-5]\d)|시\s*([0-5]\d)분)$/.exec(time.trim());
    return m ? Number(m[1]) * 60 + Number(m[2] ?? m[3]) : null;
}

/** 평일 / 토요일 / 일요일·공휴일 — 활동 시간 구분과 같다 */
export function activityDayOf(
    useDate: string,
    isHoliday: boolean,
): ActivityDay {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(useDate);
    if (!m) return "weekday";
    const day = new Date(
        Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    ).getUTCDay();
    if (day === 0 || isHoliday) return "holiday";
    return day === 6 ? "saturday" : "weekday";
}

/** 공백·괄호를 지운 병원명이 서로를 포함하면 같은 병원으로 본다 (예: "서울아산병원" ↔ "서울아산병원 신관") */
function sameHospital(a: string, b: string): boolean {
    const norm = (s: string) => s.replace(/[\s()·]/g, "").toLowerCase();
    const x = norm(a);
    const y = norm(b);
    return x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
}

export function matchRequest(
    req: RequestForMatch,
    activity: PartnerActivity,
    server: ServerMatch,
): RequestMatch {
    const required: [MatchKey, boolean][] = [];

    if (server.region !== null) required.push(["region", server.region]);

    const range = activity.times[activityDayOf(req.useDate, req.isHoliday)];
    const anyTime = Object.values(activity.times).some((r) => r !== null);
    if (anyTime) {
        const start = parseTime(req.arriveTime);
        const end =
            start === null ? null : start + (req.durationMinutes ?? 120);
        required.push([
            "time",
            range !== null &&
                start !== null &&
                end !== null &&
                start >= toMinutes(range[0]) &&
                end <= toMinutes(range[1]),
        ]);
    }

    if (server.transport !== null)
        required.push(["transport", server.transport]);

    if (activity.mobility.length > 0)
        required.push([
            "mobility",
            req.mobilityStatus !== null &&
                activity.mobility.includes(req.mobilityStatus),
        ]);

    const hospitalHit =
        req.hospitalName !== null &&
        activity.hospitals.some((h) => sameHospital(h, req.hospitalName!));

    if (required.length === 0 && !hospitalHit) return NO_MATCH;

    const hits = required.filter(([, ok]) => ok).map(([key]) => key);
    if (hospitalHit) hits.push("hospital");
    const matched = required.length > 0 && required.every(([, ok]) => ok);
    return {
        matched,
        hits,
        score: (matched ? 100 : 0) + (hospitalHit ? 10 : 0) + hits.length,
    };
}

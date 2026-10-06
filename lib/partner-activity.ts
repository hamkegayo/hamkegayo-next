import {
    TRANSPORT_LABEL,
    TRANSPORT_OPTIONS,
    type TransportCode,
} from "@/lib/handover";
import { MOBILITY_OPTIONS } from "@/app/(user)/reservation/_lib/options";
import {
    SERVICE_CLOSE_HOUR,
    SERVICE_OPEN_HOUR,
    SERVICE_SLOT_MINUTES,
} from "@/lib/service-hours";

/**
 * 파트너 활동 정보 (#226).
 *
 * DB 는 public.partner_activity_profiles (마이그레이션 87). 값 집합과 시간 범위는
 * 그쪽 CHECK·RPC 검증과 같아야 한다. 화면 검증은 안내용이고 최종 판정은 DB 다.
 */

export const ACTIVITY_DAYS = [
    { key: "weekday", label: "평일" },
    { key: "saturday", label: "토요일" },
    { key: "holiday", label: "일요일·공휴일" },
] as const;

export type ActivityDay = (typeof ACTIVITY_DAYS)[number]["key"];

/** [시작, 종료] "HH:MM". 쉬는 날은 null. */
export type ActivityRange = [string, string] | null;

export type PartnerActivity = {
    /** 법정동코드(10자리). 상위 지역은 하위 전체를 뜻한다. */
    regions: string[];
    times: Record<ActivityDay, ActivityRange>;
    transports: TransportCode[];
    mobility: string[];
    hospitals: string[];
};

/** public.partner_activity_regions 한 행. level 1 시·도 / 2 시·군·구 / 3 일반구 / 4 읍·면·동 */
export type ActivityRegion = {
    code: string;
    level: 1 | 2 | 3 | 4;
    name: string;
    fullName: string;
    /** 상위 지역 코드 (시·도부터) */
    ancestors: string[];
};

/**
 * 지역 하나를 선택에 더한다. 상위가 이미 선택돼 있으면 그대로 두고,
 * 새로 고른 지역의 하위 선택은 뺀다 — DB 저장 규칙과 같다 (사용자 결정 2026-10-06).
 */
export function addRegionSelection(
    selected: ActivityRegion[],
    region: ActivityRegion,
): ActivityRegion[] {
    if (
        selected.some(
            (s) => s.code === region.code || region.ancestors.includes(s.code),
        )
    )
        return selected;
    return [
        ...selected.filter((s) => !s.ancestors.includes(region.code)),
        region,
    ];
}

/**
 * 팝업에서 고른 지역을 저장 값으로 바꾼다. 이름을 불러오지 못해 팝업에 보이지 않았던
 * 기존 코드는 그대로 남긴다 — 조회 실패가 지역 삭제로 이어지지 않게 (#231 리뷰).
 */
export function applyPickedRegions(
    picked: ActivityRegion[],
    current: string[],
    known: ReadonlySet<string>,
): string[] {
    const codes = picked.map((r) => r.code);
    return [
        ...codes,
        ...current.filter((c) => !known.has(c) && !codes.includes(c)),
    ];
}

/** 이미 상위 지역 전체가 선택돼 있어 따로 고를 필요가 없는지 */
export function coveredBySelection(
    selected: ActivityRegion[],
    region: ActivityRegion,
): boolean {
    return selected.some((s) => region.ancestors.includes(s.code));
}

export const EMPTY_ACTIVITY: PartnerActivity = {
    regions: [],
    times: { weekday: null, saturday: null, holiday: null },
    transports: [],
    mobility: [],
    hospitals: [],
};

export const ACTIVITY_LIMITS = {
    regions: 30,
    hospitals: 10,
    hospitalLength: 50,
} as const;

export { TRANSPORT_OPTIONS, TRANSPORT_LABEL, MOBILITY_OPTIONS };

/** 이용약관 제13조 ③④ — 07:00~19:00, 30분 단위. 예약 슬롯과 같은 간격이다. */
export const ACTIVITY_TIME_OPTIONS: string[] = (() => {
    const out: string[] = [];
    for (
        let m = SERVICE_OPEN_HOUR * 60;
        m <= SERVICE_CLOSE_HOUR * 60;
        m += SERVICE_SLOT_MINUTES
    ) {
        out.push(
            `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
        );
    }
    return out;
})();

export function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}

function rangeOk(range: ActivityRange): boolean {
    if (range === null) return true;
    const [start, end] = range;
    return (
        ACTIVITY_TIME_OPTIONS.includes(start) &&
        ACTIVITY_TIME_OPTIONS.includes(end) &&
        toMinutes(start) < toMinutes(end)
    );
}

/** 저장 전 검증. 문제가 없으면 null, 있으면 사용자에게 보여줄 문구. */
export function validateActivity(a: PartnerActivity): string | null {
    if (a.regions.length > ACTIVITY_LIMITS.regions)
        return `활동 지역은 ${ACTIVITY_LIMITS.regions}곳까지 선택할 수 있습니다.`;
    if (new Set(a.regions).size !== a.regions.length)
        return "같은 활동 지역이 중복되었습니다.";
    if (a.regions.some((r) => !/^\d{10}$/.test(r)))
        return "활동 지역을 다시 선택해 주세요.";
    for (const day of ACTIVITY_DAYS) {
        if (!rangeOk(a.times[day.key]))
            return `${day.label} 활동 시간은 07:00~19:00 사이에서 시작이 종료보다 빨라야 합니다.`;
    }
    const transportCodes = TRANSPORT_OPTIONS.map((o) => o.value);
    if (
        a.transports.some((t) => !transportCodes.includes(t)) ||
        new Set(a.transports).size !== a.transports.length
    )
        return "이동수단 선택을 확인해 주세요.";
    if (
        a.mobility.some((m) => !MOBILITY_OPTIONS.includes(m)) ||
        new Set(a.mobility).size !== a.mobility.length
    )
        return "보행 보조 선택을 확인해 주세요.";
    if (a.hospitals.length > ACTIVITY_LIMITS.hospitals)
        return `선호 병원은 ${ACTIVITY_LIMITS.hospitals}곳까지 등록할 수 있습니다.`;
    if (
        a.hospitals.some(
            (h) =>
                h.trim().length === 0 ||
                h.trim().length > ACTIVITY_LIMITS.hospitalLength,
        )
    )
        return `병원명은 1~${ACTIVITY_LIMITS.hospitalLength}자로 입력해 주세요.`;
    return null;
}

/** "평일 09:00~15:00" 형태. 미리보기·고객 상세 화면에서 쓴다. */
export function activityTimeLabels(
    times: Record<ActivityDay, ActivityRange>,
): string[] {
    return ACTIVITY_DAYS.flatMap((d) => {
        const range = times[d.key];
        return range ? [`${d.label} ${range[0]}~${range[1]}`] : [];
    });
}

/** 칩·미리보기용. 읍·면·동이 아닌 지역은 하위 전체를 뜻하므로 "원주시 전체" 처럼 보인다. */
export function regionDisplayLabel(fullName: string, level?: number): string {
    const short = shortRegionLabel(fullName);
    return level === 4 ? short : `${short} 전체`;
}

/** "서울특별시 강남구" → "서울 강남구". 칩처럼 좁은 곳에 쓴다. */
export function shortRegionLabel(key: string): string {
    return key
        .replace(/^(서울|부산|대구|인천|광주|대전|울산)(특별시|광역시)/, "$1")
        .replace(/^전남광주통합특별시/, "전남광주")
        .replace(/^세종특별자치시/, "세종")
        .replace(/^제주특별자치도/, "제주")
        .replace(/^강원특별자치도/, "강원")
        .replace(/^전북특별자치도/, "전북")
        .replace(/^경기도/, "경기")
        .replace(/^충청북도/, "충북")
        .replace(/^충청남도/, "충남")
        .replace(/^전라남도/, "전남")
        .replace(/^경상북도/, "경북")
        .replace(/^경상남도/, "경남");
}

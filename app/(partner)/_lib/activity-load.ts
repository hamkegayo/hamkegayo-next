import {
    EMPTY_ACTIVITY,
    type ActivityRange,
    type ActivityRegion,
    type PartnerActivity,
} from "@/lib/partner-activity";
import type { TransportCode } from "@/lib/handover";

/** public.partner_activity_profiles 행 */
export type ActivityRow = {
    regions: string[];
    weekday_start: string | null;
    weekday_end: string | null;
    saturday_start: string | null;
    saturday_end: string | null;
    holiday_start: string | null;
    holiday_end: string | null;
    transports: TransportCode[];
    mobility_support: string[];
    preferred_hospitals: string[];
};

/**
 * 프로필 화면의 활동 정보 불러오기 결과 (#231 리뷰).
 *
 * 조회 실패를 "저장된 정보 없음"으로 취급하면 빈 폼이 보이고, 그대로 저장하면 기존 값이 지워진다.
 *  - 행 조회 실패 → ok:false. 편집기를 열지 않는다.
 *  - 지역 이름 조회 실패 → 코드는 그대로 두고 regionsUnavailable 로 지역 변경만 막는다.
 */
export type ActivityLoad =
    | { ok: false }
    | {
          ok: true;
          activity: PartnerActivity;
          /** 이름을 찾은 지역 (칩 표시용) */
          regions: ActivityRegion[];
          /** 저장된 지역 코드 중 이름을 못 찾은 것이 있음 */
          regionsUnavailable: boolean;
      };

/** DB time("09:00:00") → "09:00" */
function range(start: string | null, end: string | null): ActivityRange {
    return start && end ? [start.slice(0, 5), end.slice(0, 5)] : null;
}

export function toActivity(row: ActivityRow): PartnerActivity {
    return {
        regions: row.regions,
        times: {
            weekday: range(row.weekday_start, row.weekday_end),
            saturday: range(row.saturday_start, row.saturday_end),
            holiday: range(row.holiday_start, row.holiday_end),
        },
        transports: row.transports,
        mobility: row.mobility_support,
        hospitals: row.preferred_hospitals,
    };
}

/**
 * @param row 행 조회 결과. error 가 있으면 실패, data 가 null 이면 "아직 저장 안 함"
 * @param regions 지역 이름 조회 결과. null 이면 조회 실패
 */
export function resolveActivityLoad(
    row: { data: ActivityRow | null; error: unknown },
    regions: ActivityRegion[] | null,
): ActivityLoad {
    if (row.error) return { ok: false };
    if (!row.data)
        return {
            ok: true,
            activity: EMPTY_ACTIVITY,
            regions: [],
            regionsUnavailable: false,
        };
    const found = regions ?? [];
    const known = new Set(found.map((r) => r.code));
    return {
        ok: true,
        activity: toActivity(row.data),
        regions: found,
        regionsUnavailable: row.data.regions.some((code) => !known.has(code)),
    };
}

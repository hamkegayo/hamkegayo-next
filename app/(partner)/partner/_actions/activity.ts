"use server";

import { createClient } from "@/utils/supabase/server";
import {
    searchHospitals,
    type HospitalSearchResult,
} from "@/lib/hospital-search.server";
import { type ActivityRegion } from "@/lib/partner-activity";

type RegionRow = {
    code: string;
    level: ActivityRegion["level"];
    name: string;
    full_name: string;
    ancestors: string[];
};

const REGION_COLUMNS = "code, level, name, full_name, ancestors";

function toRegion(r: RegionRow): ActivityRegion {
    return {
        code: r.code,
        level: r.level,
        name: r.name,
        fullName: r.full_name,
        ancestors: r.ancestors,
    };
}

// 조회 실패는 null 로 돌려준다. 빈 배열과 구분해야 화면이 "없음"으로 오해하지 않는다 (#231 리뷰).

/** 지역 팝업: parent 의 바로 아래 지역. parent 가 없으면 시·도 목록 */
export async function listActivityRegions(
    parent: string | null,
): Promise<ActivityRegion[] | null> {
    if (parent !== null && !/^\d{10}$/.test(parent)) return [];
    const supabase = await createClient();
    const query = supabase
        .from("partner_activity_regions")
        .select(REGION_COLUMNS)
        .order("sort_order");
    const { data, error } = await (
        parent === null ? query.eq("level", 1) : query.eq("parent_code", parent)
    ).returns<RegionRow[]>();
    return error ? null : (data ?? []).map(toRegion);
}

/** 지역 팝업 검색: "원주 단계", "장안구" 처럼 띄어 쓴 단어를 모두 포함하는 지역 */
export async function searchActivityRegions(
    keyword: string,
): Promise<ActivityRegion[] | null> {
    const words = keyword
        .replace(/[%_\\]/g, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4);
    if (words.length === 0 || words.join("").length < 2) return [];
    const supabase = await createClient();
    let query = supabase
        .from("partner_activity_regions")
        .select(REGION_COLUMNS);
    for (const w of words) query = query.ilike("full_name", `%${w}%`);
    const { data, error } = await query
        .order("level")
        .order("sort_order")
        .limit(30)
        .returns<RegionRow[]>();
    return error ? null : (data ?? []).map(toRegion);
}

/** 저장된 코드의 지역 정보 (칩 표시용) */
export async function getActivityRegionsByCode(
    codes: string[],
): Promise<ActivityRegion[] | null> {
    const valid = codes.filter((c) => /^\d{10}$/.test(c));
    if (valid.length === 0) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("partner_activity_regions")
        .select(REGION_COLUMNS)
        .in("code", valid)
        .order("sort_order")
        .returns<RegionRow[]>();
    return error ? null : (data ?? []).map(toRegion);
}

/**
 * 선호 병원 검색 (#226). 로그인한 파트너만 쓴다 — 공개로 열면 공공 API 호출 한도를 외부에서 소진할 수 있다.
 * 결과는 이름·종별·지역뿐이며, 저장은 지금처럼 병원 이름(문자열)으로 한다.
 */
export async function searchPreferredHospitals(
    keyword: string,
): Promise<HospitalSearchResult> {
    if (typeof keyword !== "string")
        return {
            ok: false,
            reason: "invalid",
            message: "병원 이름을 입력해 주세요.",
        };
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "PARTNER")
        return {
            ok: false,
            reason: "unavailable",
            message: "파트너 로그인이 필요합니다.",
        };
    return searchHospitals(keyword);
}

import { createClient } from "@/utils/supabase/server";
import { getActivityRegionsByCode } from "../partner/_actions/activity";
import {
    resolveActivityLoad,
    type ActivityLoad,
    type ActivityRow,
} from "./activity-load";

/**
 * 로그인한 파트너의 활동 정보와 고른 지역의 이름.
 * 조회 실패는 ok:false 로 돌려준다 — 빈 값으로 바꾸면 저장 때 기존 값을 지운다 (#231 리뷰).
 */
export async function getMyPartnerActivity(): Promise<ActivityLoad> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { ok: false };

        const row = await supabase
            .from("partner_activity_profiles")
            .select(
                "regions, weekday_start, weekday_end, saturday_start, saturday_end, holiday_start, holiday_end, transports, mobility_support, preferred_hospitals",
            )
            .eq("partner_id", user.id)
            .maybeSingle<ActivityRow>();
        const regions =
            !row.error && row.data
                ? await getActivityRegionsByCode(row.data.regions)
                : [];
        return resolveActivityLoad(row, regions);
    } catch {
        return { ok: false };
    }
}

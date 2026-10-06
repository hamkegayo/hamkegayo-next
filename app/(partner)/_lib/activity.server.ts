import { createClient } from "@/utils/supabase/server";
import {
    EMPTY_ACTIVITY,
    type ActivityRange,
    type ActivityRegion,
    type PartnerActivity,
} from "@/lib/partner-activity";
import type { TransportCode } from "@/lib/handover";

type Row = {
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

/** DB time("09:00:00") → "09:00" */
function range(start: string | null, end: string | null): ActivityRange {
    return start && end ? [start.slice(0, 5), end.slice(0, 5)] : null;
}

/** 로그인한 파트너의 활동 정보와 지역 선택지. 저장 전이면 빈 값이다. */
export async function getMyPartnerActivity(): Promise<{
    activity: PartnerActivity;
    regions: ActivityRegion[];
}> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { activity: EMPTY_ACTIVITY, regions: [] };

    const [{ data: row }, { data: regions }] = await Promise.all([
        supabase
            .from("partner_activity_profiles")
            .select(
                "regions, weekday_start, weekday_end, saturday_start, saturday_end, holiday_start, holiday_end, transports, mobility_support, preferred_hospitals",
            )
            .eq("partner_id", user.id)
            .maybeSingle<Row>(),
        supabase
            .from("partner_activity_regions")
            .select("key, sido, sigungu")
            .order("sort_order")
            .returns<ActivityRegion[]>(),
    ]);

    return {
        activity: row
            ? {
                  regions: row.regions,
                  times: {
                      weekday: range(row.weekday_start, row.weekday_end),
                      saturday: range(row.saturday_start, row.saturday_end),
                      holiday: range(row.holiday_start, row.holiday_end),
                  },
                  transports: row.transports,
                  mobility: row.mobility_support,
                  hospitals: row.preferred_hospitals,
              }
            : EMPTY_ACTIVITY,
        regions: regions ?? [],
    };
}

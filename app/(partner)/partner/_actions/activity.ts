"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { validateActivity, type PartnerActivity } from "@/lib/partner-activity";

export type ActivityResult = { ok: true } | { ok: false; message: string };

/** 활동 정보 저장 (#226). 최종 검증은 save_partner_activity_profile RPC 가 한다. */
export async function savePartnerActivity(
    input: PartnerActivity,
): Promise<ActivityResult> {
    try {
        const supabase = await createClient();
        const { data: regions } = await supabase
            .from("partner_activity_regions")
            .select("key");
        const message = validateActivity(
            input,
            new Set((regions ?? []).map((r: { key: string }) => r.key)),
        );
        if (message) return { ok: false, message };

        const { weekday, saturday, holiday } = input.times;
        const { error } = await supabase.rpc("save_partner_activity_profile", {
            p_regions: input.regions,
            p_weekday_start: weekday?.[0] ?? null,
            p_weekday_end: weekday?.[1] ?? null,
            p_saturday_start: saturday?.[0] ?? null,
            p_saturday_end: saturday?.[1] ?? null,
            p_holiday_start: holiday?.[0] ?? null,
            p_holiday_end: holiday?.[1] ?? null,
            p_transports: input.transports,
            p_mobility: input.mobility,
            p_hospitals: input.hospitals.map((h) => h.trim()),
        });
        if (error) {
            return {
                ok: false,
                message:
                    error.code === "42501"
                        ? "활동 중인 파트너만 저장할 수 있습니다."
                        : "활동 정보를 저장하지 못했습니다. 입력 내용을 확인해 주세요.",
            };
        }
        revalidatePath("/partner/profile");
        return { ok: true };
    } catch {
        return {
            ok: false,
            message: "저장 요청에 실패했습니다. 다시 시도해 주세요.",
        };
    }
}

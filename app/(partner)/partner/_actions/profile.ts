"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { validateActivity, type PartnerActivity } from "@/lib/partner-activity";
import {
    isValidPartnerIntro,
    PARTNER_INTRO_MAX_LENGTH_MESSAGE,
} from "@/lib/partner-profile";

export async function savePartnerProfile(
    intro: string,
    activity: PartnerActivity | null,
) {
    if (typeof intro !== "string" || !isValidPartnerIntro(intro))
        return {
            ok: false as const,
            message: PARTNER_INTRO_MAX_LENGTH_MESSAGE,
        };
    const message = activity === null ? null : validateActivity(activity);
    if (message) return { ok: false as const, message };
    try {
        const { error } = await (
            await createClient()
        ).rpc("save_partner_profile", {
            p_intro: intro,
            p_activity: activity,
        });
        if (error)
            return {
                ok: false as const,
                message:
                    "프로필을 저장하지 못했습니다. 입력 내용과 로그인 상태를 확인해 주세요.",
            };
        revalidatePath("/partner/profile");
        return { ok: true as const };
    } catch {
        return {
            ok: false as const,
            message:
                "저장 요청에 실패했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.",
        };
    }
}

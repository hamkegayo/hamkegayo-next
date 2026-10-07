"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type PartnerNotificationPrefs = { emailNewRequest: boolean };

/** 본인 알림 설정. 행이 없으면 기본값(새 요청 이메일 켜짐, #255). */
export async function getMyNotificationPrefs(): Promise<PartnerNotificationPrefs | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("partner_notification_prefs")
        .select("email_new_request")
        .maybeSingle();
    if (error) return null;
    return { emailNewRequest: data?.email_new_request ?? true };
}

export async function setEmailNewRequest(
    enabled: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_my_partner_notification_prefs", {
        p_email_new_request: enabled === true,
    });
    if (error)
        return {
            ok: false,
            message: "설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        };
    revalidatePath("/partner/notifications");
    return { ok: true };
}

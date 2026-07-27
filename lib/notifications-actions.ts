"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

/** 알림 1건 읽음 처리 */
export async function markNotificationRead(id: string): Promise<void> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("recipient_id", user.id);

    revalidatePath("/mypage/notifications");
    revalidatePath("/partner/notifications");
}

/** 전체 읽음 처리 */
export async function markAllNotificationsRead(): Promise<void> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_id", user.id)
        .eq("is_read", false);

    revalidatePath("/mypage/notifications");
    revalidatePath("/partner/notifications");
}

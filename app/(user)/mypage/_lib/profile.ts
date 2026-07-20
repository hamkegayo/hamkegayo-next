import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

/**
 * 마이페이지용 세션 + 프로필 조회.
 * 비로그인 시 /login 으로 리다이렉트한다.
 */
export async function getSessionProfile() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("name, phone, role, status, created_at, phone_verified_at")
        .eq("id", user.id)
        .maybeSingle();

    return { user, profile };
}

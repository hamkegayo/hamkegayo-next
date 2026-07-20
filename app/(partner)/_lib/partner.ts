import { createClient } from "@/utils/supabase/server";

/**
 * 로그인한 파트너의 표시 이름 ("{name} 파트너").
 * 가드 없이 화면만 제공하므로, 비로그인/조회 실패 시 데모 기본값을 반환한다.
 */
export async function getPartnerName(): Promise<string> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return "박소연 파트너";

        const { data } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .maybeSingle();

        return data?.name ? `${data.name} 파트너` : "박소연 파트너";
    } catch {
        return "박소연 파트너";
    }
}

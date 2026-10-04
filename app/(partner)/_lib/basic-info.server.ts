import { createClient } from "@/utils/supabase/server";

export type PartnerBasicInfo = {
    name: string;
    phone: string;
    email: string;
    intro: string;
};

const EMPTY_BASIC_INFO: PartnerBasicInfo = {
    name: "",
    phone: "",
    email: "",
    intro: "",
};

/** 로그인한 파트너의 기본 정보. 연락처 이메일은 Auth 합성 이메일이 아닌 profiles 값이다. */
export async function getPartnerBasicInfo(): Promise<PartnerBasicInfo> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return EMPTY_BASIC_INFO;

        const [{ data: profile }, { data: account }] = await Promise.all([
            supabase
                .from("profiles")
                .select("name, phone, email")
                .eq("id", user.id)
                .maybeSingle<{
                    name: string;
                    phone: string | null;
                    email: string | null;
                }>(),
            supabase
                .from("partner_accounts")
                .select("intro")
                .eq("profile_id", user.id)
                .maybeSingle<{ intro: string | null }>(),
        ]);

        if (!profile || !account) return EMPTY_BASIC_INFO;

        return {
            name: profile.name,
            phone: profile.phone ?? "",
            email: profile.email ?? "",
            intro: account.intro ?? "",
        };
    } catch {
        return EMPTY_BASIC_INFO;
    }
}

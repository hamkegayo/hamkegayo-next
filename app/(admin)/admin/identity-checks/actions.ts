"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/** 생년월일 본인확인 결정 (#226). 결정과 동시에 생년월일을 파기한다(admin_decide_partner_identity). */
export async function decidePartnerIdentity(input: {
    partnerId: string;
    verified: boolean;
    reason: string;
}) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_decide_partner_identity", {
        p_partner_id: input.partnerId,
        p_verified: input.verified,
        p_reason: input.reason,
    });
    if (error)
        return {
            ok: false,
            message:
                error.code === "P0002"
                    ? "다른 담당자가 처리했거나 기간이 지나 파기된 항목입니다. 새로고침해 주세요."
                    : "심사 권한·2단계 인증과 사유(2~300자)를 확인해 주세요.",
        };
    revalidatePath("/admin/identity-checks");
    revalidatePath("/partner/profile");
    return { ok: true };
}

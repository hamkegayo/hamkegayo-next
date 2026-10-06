"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/**
 * 생년월일 본인확인 결정 (#226). 결정과 동시에 생년월일을 파기한다(admin_decide_partner_identity).
 * expectedSubmittedAt: 화면이 읽은 제출 시각. 그 사이 바뀌었으면 DB 가 거부한다 (#235 리뷰).
 * 확인 완료는 사유 없이 고정 기록만 남기고, 반려 사유는 생년월일·번호를 담을 수 없다.
 */
export async function decidePartnerIdentity(input: {
    partnerId: string;
    expectedSubmittedAt: string;
    verified: boolean;
    reason: string;
}) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_decide_partner_identity", {
        p_partner_id: input.partnerId,
        p_expected_submitted_at: input.expectedSubmittedAt,
        p_verified: input.verified,
        p_reason: input.verified ? null : input.reason,
    });
    if (error)
        return {
            ok: false,
            message:
                error.code === "P0002"
                    ? "그 사이 다시 제출됐거나 처리·파기된 항목입니다. 새로고침해 주세요."
                    : error.message.includes("reason_contains_personal_data")
                      ? "반려 사유에 생년월일·주민번호 같은 숫자를 적을 수 없습니다."
                      : "심사 권한·2단계 인증과 반려 사유(2~300자)를 확인해 주세요.",
        };
    revalidatePath("/admin/identity-checks");
    revalidatePath("/partner/profile");
    return { ok: true };
}

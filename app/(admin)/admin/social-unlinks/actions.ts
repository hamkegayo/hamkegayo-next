"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

/**
 * 카카오 연결 해제 건을 처리 완료한다 (#291). 기록은 파기되고 메모는 접속기록에 남는다.
 * 회원 데이터는 바꾸지 않는다.
 */
export async function resolveSocialUnlink(input: { id: string; memo: string }) {
    const memo = input.memo.trim();
    if (memo.length < 2 || memo.length > 1000)
        return { ok: false, message: "처리 메모를 2자 이상 입력해 주세요." };

    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_resolve_social_unlink", {
        p_id: input.id,
        p_memo: memo,
    });
    if (error)
        return {
            ok: false,
            message:
                error.code === "P0002"
                    ? "이미 처리된 건입니다. 새로고침해 주세요."
                    : "처리 완료 표시에 실패했습니다. 관리자 권한과 2단계 인증을 확인해 주세요.",
        };

    revalidatePath("/admin");
    revalidatePath("/admin/social-unlinks");
    return { ok: true };
}

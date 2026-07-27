"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

export type UpdateNameResult = { ok: true } | { ok: false; message: string };

/** 회원 이름 수정 (profiles.name) */
export async function updateProfileName(
    name: string,
): Promise<UpdateNameResult> {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
        return { ok: false, message: "이름을 2자 이상 입력해 주세요." };
    }
    if (trimmed.length > 20) {
        return { ok: false, message: "이름은 20자 이하로 입력해 주세요." };
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { error } = await supabase
        .from("profiles")
        .update({ name: trimmed })
        .eq("id", user.id);

    if (error) {
        return {
            ok: false,
            message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    revalidatePath("/mypage/profile");
    revalidatePath("/mypage");
    return { ok: true };
}

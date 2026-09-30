"use server";

import { AGREEMENT_VERSION } from "@/lib/legal/agreements";
import { normalizePhone } from "@/lib/otp";
import { safeInternalPath } from "@/lib/auth/social";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

import { socialSignupSchema, type SocialSignupValues } from "./schema";

export type CompleteSocialSignupResult =
    { ok: true; redirectTo: string } | { ok: false; message: string };

export async function completeSocialSignup(
    input: SocialSignupValues,
    next: string,
): Promise<CompleteSocialSignupResult> {
    const parsed = socialSignupSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, message: "입력 내용과 필수 동의를 확인해 주세요." };
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
        return {
            ok: false,
            message:
                "소셜 계정에서 이메일을 확인할 수 없습니다. 다른 계정을 이용해 주세요.",
        };
    }

    const admin = createAdminClient();
    const { error } = await admin.rpc("complete_social_signup", {
        p_user_id: user.id,
        p_name: parsed.data.name,
        p_phone: normalizePhone(parsed.data.phone),
        p_email: user.email.toLowerCase(),
        p_service_version: AGREEMENT_VERSION.SERVICE,
        p_privacy_version: AGREEMENT_VERSION.PRIVACY,
    });

    if (error) {
        console.error("[completeSocialSignup] 가입 완료 실패:", error.code);
        const duplicate = error.code === "23505";
        return {
            ok: false,
            message: duplicate
                ? "이미 사용 중인 이메일입니다. 기존 로그인 방식으로 로그인해 주세요."
                : "가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    await supabase.auth.refreshSession();
    return { ok: true, redirectTo: safeInternalPath(next) };
}

"use server";

import { revalidatePath } from "next/cache";

import {
    getPartnerEmailChangeErrorMessage,
    isValidPartnerIntro,
    PARTNER_INTRO_MAX_LENGTH_MESSAGE,
} from "@/lib/partner-profile";
import { isValidEmail, normalizeEmail, VERIFIED_VALID_MS } from "@/lib/otp";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type BasicInfoResult = { ok: true } | { ok: false; message: string };

async function getCurrentPartnerId(): Promise<string | null> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: account } = await supabase
        .from("partner_accounts")
        .select("profile_id")
        .eq("profile_id", user.id)
        .maybeSingle();
    return account?.profile_id ?? null;
}

/** 파트너 자기소개 저장. 화면 제한과 별개로 서버에서도 300자를 검증한다. */
export async function updatePartnerBasicInfo(
    intro: string,
): Promise<BasicInfoResult> {
    if (typeof intro !== "string" || !isValidPartnerIntro(intro)) {
        return { ok: false, message: PARTNER_INTRO_MAX_LENGTH_MESSAGE };
    }

    const partnerId = await getCurrentPartnerId();
    if (!partnerId) return { ok: false, message: "로그인이 필요합니다." };

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("partner_accounts")
        .update({ intro })
        .eq("profile_id", partnerId)
        .select("profile_id")
        .maybeSingle();

    if (error || !data) {
        return {
            ok: false,
            message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    revalidatePath("/partner/profile");
    return { ok: true };
}

/**
 * 최근 OTP 인증을 마친 이메일만 연락용 이메일로 반영한다.
 * 파트너 로그인은 발급 아이디의 합성 이메일을 사용하므로 Auth 이메일은 변경하지 않는다.
 */
export async function changePartnerEmail(
    emailRaw: string,
): Promise<BasicInfoResult> {
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) {
        return { ok: false, message: "올바른 이메일을 입력해 주세요." };
    }

    const partnerId = await getCurrentPartnerId();
    if (!partnerId) return { ok: false, message: "로그인이 필요합니다." };

    const admin = createAdminClient();
    const { data: verification } = await admin
        .from("email_verifications")
        .select("consumed_at")
        .eq("email", email)
        .not("consumed_at", "is", null)
        .order("consumed_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ consumed_at: string | null }>();

    if (
        !verification?.consumed_at ||
        Date.now() - new Date(verification.consumed_at).getTime() >
            VERIFIED_VALID_MS
    ) {
        return { ok: false, message: "이메일 인증을 먼저 해주세요." };
    }

    const { data, error } = await admin
        .from("profiles")
        .update({ email })
        .eq("id", partnerId)
        .eq("role", "PARTNER")
        .select("id")
        .maybeSingle();

    if (error || !data) {
        return {
            ok: false,
            message: getPartnerEmailChangeErrorMessage(error?.code),
        };
    }

    revalidatePath("/partner/profile");
    return { ok: true };
}

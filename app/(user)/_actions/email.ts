"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { buildOtpEmailHtml, getEmailSender } from "@/lib/email";
import {
    CODE_TTL_MS,
    MAX_ATTEMPTS,
    RESEND_COOLDOWN_MS,
    generateCode,
    hashCode,
    isValidEmail,
    normalizeEmail,
} from "@/lib/otp";

export type RequestCodeResult =
    { ok: true; devCode?: string } | { ok: false; message: string };

export type VerifyCodeResult = { ok: true } | { ok: false; message: string };

const isDev = process.env.NODE_ENV !== "production";

/**
 * 이메일 인증번호 발송 요청.
 * 코드를 생성·저장하고 이메일(mock/resend)로 발송한다.
 * 개발 모드에서는 입력 확인을 위해 devCode 를 함께 반환한다(운영에서는 미반환).
 */
export async function requestEmailCode(
    emailRaw: string,
): Promise<RequestCodeResult> {
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) {
        return { ok: false, message: "올바른 이메일을 입력해 주세요." };
    }

    const admin = createAdminClient();

    // 재발송 쿨다운 체크 (아직 소비되지 않은 최근 코드 기준)
    const { data: last } = await admin
        .from("email_verifications")
        .select("created_at")
        .eq("email", email)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (
        last &&
        Date.now() - new Date(last.created_at).getTime() < RESEND_COOLDOWN_MS
    ) {
        return { ok: false, message: "잠시 후 다시 시도해 주세요." };
    }

    const code = generateCode();
    const { error } = await admin.from("email_verifications").insert({
        email,
        code_hash: hashCode(code),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });

    if (error) {
        return { ok: false, message: "인증번호 발송에 실패했습니다." };
    }

    try {
        await getEmailSender().send(
            email,
            "[함께가요] 이메일 인증번호",
            buildOtpEmailHtml(code),
        );
    } catch (e) {
        console.error("[requestEmailCode] 메일 발송 실패:", e);
        return { ok: false, message: "인증번호 발송에 실패했습니다." };
    }

    return isDev ? { ok: true, devCode: code } : { ok: true };
}

/**
 * 이메일 인증번호 검증.
 * 성공 시 해당 코드를 소비 처리(consumed_at)하며, 회원가입 단계에서 이를 신뢰한다.
 */
export async function verifyEmailCode(
    emailRaw: string,
    code: string,
): Promise<VerifyCodeResult> {
    const email = normalizeEmail(emailRaw);
    const admin = createAdminClient();

    const { data: row } = await admin
        .from("email_verifications")
        .select("id, code_hash, expires_at, attempts")
        .eq("email", email)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!row) {
        return { ok: false, message: "인증번호를 먼저 요청해 주세요." };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
        return {
            ok: false,
            message: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
        };
    }
    if (row.attempts >= MAX_ATTEMPTS) {
        return {
            ok: false,
            message: "시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.",
        };
    }
    if (row.code_hash !== hashCode(code)) {
        await admin
            .from("email_verifications")
            .update({ attempts: row.attempts + 1 })
            .eq("id", row.id);
        return { ok: false, message: "인증번호가 일치하지 않습니다." };
    }

    await admin
        .from("email_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);

    return { ok: true };
}

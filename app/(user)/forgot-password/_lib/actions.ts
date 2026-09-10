"use server";

/**
 * 비밀번호 재설정 (이메일 OTP).
 *
 *  로그인 화면의 '비밀번호 찾기' 가 준비중 토스트만 띄우고 있었다. 인증 인프라는
 *  이미 있었다 — email_verifications 원장과 Resend 발송(#58 이전부터), 회원가입이
 *  같은 코드를 쓴다. 재설정 경로만 없었다.
 *
 *  ⚠️ 세 가지를 지킨다.
 *
 *  1. **가입 여부를 알려주지 않는다.** 1단계는 계정이 없어도 항상 성공으로
 *     답한다. 응답이 갈리면 이 화면이 가입자 이메일 목록을 확인하는 도구가 된다.
 *     실제 발송은 계정이 있을 때만 한다 — 모르는 주소로 코드를 뿌리지 않는다.
 *
 *  2. **일반 회원(USER)만 대상이다.** 파트너 계정은 합성 이메일
 *     ({login_id}@partner.hamkegayo.internal)이라 메일이 닿지 않고, 관리자는
 *     수동 발급 계정이다. 둘 다 담당자를 통해야 한다.
 *
 *  3. **검증과 변경을 한 호출로 끝낸다.** 코드를 소비한 뒤 비밀번호 변경이
 *     따로 열려 있으면 그 사이가 빈틈이 된다. 실패하면 코드를 다시 받게 한다.
 */

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
import { PASSWORD_RULE_MESSAGE, isValidPassword } from "@/lib/password";

export type ResetResult = { ok: true } | { ok: false; message: string };

/** 이메일로 재설정 가능한 일반 회원을 찾는다. 없거나 USER 가 아니면 null. */
async function findResettableUser(
    admin: ReturnType<typeof createAdminClient>,
    email: string,
): Promise<{ id: string } | null> {
    const { data } = await admin
        .from("profiles")
        .select("id, role, status")
        .eq("email", email)
        .eq("role", "USER")
        .maybeSingle();

    if (!data) return null;
    // 탈퇴·정지 계정은 되살리지 않는다.
    if (data.status !== "ACTIVE") return null;
    return { id: data.id };
}

/**
 * 1단계 — 재설정 코드 발송.
 *
 * 계정이 없어도 `ok: true` 다. 화면은 언제나 "메일을 보냈습니다" 로 안내한다.
 */
export async function requestPasswordReset(
    emailRaw: string,
): Promise<ResetResult> {
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) {
        return { ok: false, message: "올바른 이메일을 입력해 주세요." };
    }

    const admin = createAdminClient();

    // 쿨다운은 계정 존재 여부와 무관하게 건다 — 여기서 응답이 갈리면
    // 그 자체가 가입 여부를 알려주는 신호가 된다.
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

    const user = await findResettableUser(admin, email);
    if (!user) return { ok: true }; // 조용히 종료 — 발송하지 않는다

    const code = generateCode();
    const { error } = await admin.from("email_verifications").insert({
        email,
        code_hash: hashCode(code),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    if (error) {
        console.error("[requestPasswordReset] 코드 저장 실패:", error);
        return { ok: false, message: "잠시 후 다시 시도해 주세요." };
    }

    try {
        await getEmailSender().send(
            email,
            "[함께가요] 비밀번호 재설정 인증번호",
            buildOtpEmailHtml(code),
        );
    } catch (e) {
        console.error("[requestPasswordReset] 메일 발송 실패:", e);
        return { ok: false, message: "잠시 후 다시 시도해 주세요." };
    }

    return { ok: true };
}

/**
 * 2단계 — 코드 검증 + 비밀번호 변경.
 *
 * 코드 소비와 비밀번호 변경을 한 호출에서 끝낸다.
 */
export async function resetPassword(
    emailRaw: string,
    code: string,
    newPassword: string,
): Promise<ResetResult> {
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) {
        return { ok: false, message: "올바른 이메일을 입력해 주세요." };
    }
    if (!isValidPassword(newPassword)) {
        return { ok: false, message: PASSWORD_RULE_MESSAGE };
    }

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

    // 코드가 맞아도 대상이 없으면 여기서 끝낸다. 1단계에서 발송하지 않았으므로
    // 정상 경로에서는 도달하지 않는다.
    const user = await findResettableUser(admin, email);
    if (!user) {
        return { ok: false, message: "인증번호가 일치하지 않습니다." };
    }

    await admin
        .from("email_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
        password: newPassword,
    });
    if (updErr) {
        console.error("[resetPassword] 비밀번호 변경 실패:", updErr);
        return {
            ok: false,
            message: "비밀번호 변경에 실패했습니다. 다시 시도해 주세요.",
        };
    }

    return { ok: true };
}

"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * 관리자 로그인 (#50).
 *
 * 이메일 + 비밀번호로 1차 인증한 뒤 TOTP 2차 인증까지 마쳐야 aal2 가 된다.
 * DB 의 is_admin() 이 aal2 를 요구하므로, 여기를 통과하지 못하면
 * 관리자 화면에 들어가더라도 아무 데이터도 읽히지 않는다.
 *
 * 최초 로그인 시에는 등록된 인증기가 없으므로 등록(enroll)부터 시킨다.
 * 이 화면이 없으면 최초 관리자가 잠기기 때문에 #56 으로 미루지 않았다.
 */

const ADMIN_HOME = "/admin";

/** 로그인 1단계 결과 — 다음에 무엇을 해야 하는지 */
export type AdminLoginResult =
    { ok: true; next: "enroll" | "verify" } | { ok: false; message: string };

export type EnrollResult =
    | { ok: true; factorId: string; qr: string; secret: string }
    | { ok: false; message: string };

export type VerifyResult =
    { ok: true; redirectTo: string } | { ok: false; message: string };

/** 1단계 — 이메일 + 비밀번호 */
export async function loginAdmin(input: {
    email: string;
    password: string;
}): Promise<AdminLoginResult> {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
    });

    if (error || !data.user) {
        return {
            ok: false,
            message: "이메일 또는 비밀번호가 올바르지 않습니다.",
        };
    }

    // 관리자가 아닌 계정이 관리자 로그인으로 들어오는 것 차단
    if (data.user.app_metadata?.role !== "ADMIN") {
        await supabase.auth.signOut();
        return { ok: false, message: "관리자 계정이 아닙니다." };
    }

    if (data.user.app_metadata?.status !== "ACTIVE") {
        await supabase.auth.signOut();
        return { ok: false, message: "정지된 계정입니다." };
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.all ?? []).some(
        (f) => f.factor_type === "totp" && f.status === "verified",
    );

    return { ok: true, next: verified ? "verify" : "enroll" };
}

/** 2단계(최초 로그인) — 인증기 등록. QR 과 수동 입력용 키를 돌려준다. */
export async function enrollTotp(): Promise<EnrollResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "ADMIN") {
        return { ok: false, message: "다시 로그인해 주세요." };
    }

    // 등록만 하고 검증을 끝내지 못한 인증기가 남아 있으면 새로 만들 수 없다.
    // 미검증 인증기는 쓸모가 없으므로 정리하고 새로 발급한다.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") {
            await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `admin-${Date.now()}`,
        issuer: "함께가요 관리자",
    });

    if (error || !data) {
        return { ok: false, message: "인증기 등록을 시작하지 못했습니다." };
    }

    return {
        ok: true,
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
    };
}

/** 마지막 단계 — 6자리 코드 검증. 성공하면 세션이 aal2 로 올라간다. */
export async function verifyTotp(input: {
    factorId?: string;
    code: string;
}): Promise<VerifyResult> {
    const supabase = await createClient();

    const code = input.code.replace(/\D/g, "");
    if (code.length !== 6) {
        return { ok: false, message: "6자리 숫자를 입력해 주세요." };
    }

    let factorId = input.factorId;
    if (!factorId) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        factorId = (factors?.all ?? []).find(
            (f) => f.factor_type === "totp" && f.status === "verified",
        )?.id;
    }
    if (!factorId) {
        return { ok: false, message: "등록된 인증기가 없습니다." };
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
    });

    if (error) {
        return { ok: false, message: "인증 코드가 맞지 않습니다." };
    }

    return { ok: true, redirectTo: ADMIN_HOME };
}

/** 인증 도중 빠져나갈 때 — 1차 인증만 된 세션을 남기지 않는다 */
export async function cancelAdminLogin(): Promise<void> {
    const supabase = await createClient();
    await supabase.auth.signOut();
}

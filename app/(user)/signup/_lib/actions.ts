"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/utils/supabase/admin";
import {
    VERIFIED_VALID_MS,
    isValidEmail,
    isValidPhone,
    normalizeEmail,
    normalizePhone,
} from "@/lib/otp";

export type SignUpResult =
    | { ok: true }
    | {
          ok: false;
          field?: "email" | "loginId" | "phone" | "form";
          message: string;
      };

/** 최근(VERIFIED_VALID_MS 이내) 인증 완료된 이메일인지 확인 */
async function isEmailVerified(
    admin: SupabaseClient,
    email: string,
): Promise<boolean> {
    const { data } = await admin
        .from("email_verifications")
        .select("consumed_at")
        .eq("email", email)
        .not("consumed_at", "is", null)
        .order("consumed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!data?.consumed_at) return false;
    return (
        Date.now() - new Date(data.consumed_at).getTime() <= VERIFIED_VALID_MS
    );
}

/**
 * 일반 사용자 회원가입.
 * auth 유저 생성(이메일 확인 생략) → profiles insert. 프로필 실패 시 auth 유저 롤백.
 * 이메일은 OTP 인증을 통과한 값만 신뢰한다. 휴대폰은 인증 없이 저장.
 */
export async function signUpUser(input: {
    email: string;
    password: string;
    name: string;
    phone: string;
}): Promise<SignUpResult> {
    const admin = createAdminClient();
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);

    if (!isValidEmail(email)) {
        return {
            ok: false,
            field: "email",
            message: "올바른 이메일을 입력해 주세요.",
        };
    }
    if (!(await isEmailVerified(admin, email))) {
        return {
            ok: false,
            field: "email",
            message: "이메일 인증을 먼저 해주세요.",
        };
    }
    if (!isValidPhone(phone)) {
        return {
            ok: false,
            field: "phone",
            message: "올바른 휴대폰번호를 입력해 주세요.",
        };
    }

    // auth 유저 생성 (OTP 로 이미 이메일을 확인했으므로 email_confirm: true)
    const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
            email,
            password: input.password,
            email_confirm: true,
        });

    if (createErr || !created?.user) {
        console.error("[signUpUser] createUser 실패:", createErr);
        const dup =
            createErr?.code === "email_exists" ||
            /already|registered|exist/i.test(createErr?.message ?? "");
        if (dup) {
            return {
                ok: false,
                field: "email",
                message: "이미 가입된 이메일입니다.",
            };
        }
        return {
            ok: false,
            field: "form",
            message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    const userId = created.user.id;
    const { error: profileErr } = await admin.from("profiles").insert({
        id: userId,
        role: "USER",
        name: input.name,
        email,
        phone,
        status: "ACTIVE",
    });

    if (profileErr) {
        console.error("[signUpUser] profiles insert 실패:", profileErr);
        // 프로필 생성 실패 → 고아 auth 유저 롤백
        await admin.auth.admin.deleteUser(userId);
        return {
            ok: false,
            field: "form",
            message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    return { ok: true };
}

/**
 * 파트너 회원가입 = 관리자가 발급한 계정(login_id) 활성화.
 * 로그인은 아이디(합성 이메일)지만, 인증한 실제 이메일을 profiles.email 에 저장한다.
 * 비밀번호 설정 + 프로필(이름/이메일/전화/상태) 업데이트.
 */
export async function activatePartner(input: {
    loginId: string;
    email: string;
    password: string;
    name: string;
    phone: string;
}): Promise<SignUpResult> {
    const admin = createAdminClient();
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const loginId = input.loginId.trim();

    if (!isValidEmail(email)) {
        return {
            ok: false,
            field: "email",
            message: "올바른 이메일을 입력해 주세요.",
        };
    }
    if (!(await isEmailVerified(admin, email))) {
        return {
            ok: false,
            field: "email",
            message: "이메일 인증을 먼저 해주세요.",
        };
    }
    if (!isValidPhone(phone)) {
        return {
            ok: false,
            field: "phone",
            message: "올바른 휴대폰번호를 입력해 주세요.",
        };
    }

    const { data: account } = await admin
        .from("partner_accounts")
        .select("profile_id")
        .eq("login_id", loginId)
        .maybeSingle();

    if (!account) {
        return {
            ok: false,
            field: "loginId",
            message: "발급되지 않은 아이디입니다.",
        };
    }

    const { data: profile } = await admin
        .from("profiles")
        .select("status")
        .eq("id", account.profile_id)
        .maybeSingle();

    if (profile?.status === "ACTIVE") {
        return {
            ok: false,
            field: "loginId",
            message: "이미 가입이 완료된 아이디입니다.",
        };
    }

    const { error: pwErr } = await admin.auth.admin.updateUserById(
        account.profile_id,
        { password: input.password },
    );
    if (pwErr) {
        return {
            ok: false,
            field: "form",
            message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    const { error: upErr } = await admin
        .from("profiles")
        .update({
            name: input.name,
            email,
            phone,
            status: "ACTIVE",
        })
        .eq("id", account.profile_id);

    if (upErr) {
        return {
            ok: false,
            field: "form",
            message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    return { ok: true };
}

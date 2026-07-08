"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/utils/supabase/admin";
import {
  VERIFIED_VALID_MS,
  isValidPhone,
  normalizePhone,
} from "@/lib/otp";

export type SignUpResult =
  | { ok: true }
  | {
      ok: false;
      field?: "email" | "loginId" | "phone" | "form";
      message: string;
    };

/** 최근(VERIFIED_VALID_MS 이내) 인증 완료된 번호인지 확인 */
async function isPhoneVerified(
  admin: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const { data } = await admin
    .from("phone_verifications")
    .select("consumed_at")
    .eq("phone", phone)
    .not("consumed_at", "is", null)
    .order("consumed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.consumed_at) return false;
  return Date.now() - new Date(data.consumed_at).getTime() <= VERIFIED_VALID_MS;
}

/**
 * 일반 사용자 회원가입.
 * auth 유저 생성(이메일 확인 생략) → profiles insert. 프로필 실패 시 auth 유저 롤백.
 */
export async function signUpUser(input: {
  email: string;
  password: string;
  name: string;
  phone: string;
}): Promise<SignUpResult> {
  const admin = createAdminClient();
  const phone = normalizePhone(input.phone);

  if (!isValidPhone(phone)) {
    return { ok: false, field: "phone", message: "올바른 휴대폰번호를 입력해 주세요." };
  }
  if (!(await isPhoneVerified(admin, phone))) {
    return { ok: false, field: "phone", message: "휴대폰 인증을 먼저 해주세요." };
  }

  // auth 유저 생성 (MVP: 이메일 확인 메일 없이 즉시 사용 가능)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    console.error("[signUpUser] createUser 실패:", createErr);
    const dup =
      createErr?.code === "email_exists" ||
      /already|registered|exist/i.test(createErr?.message ?? "");
    if (dup) {
      return { ok: false, field: "email", message: "이미 가입된 이메일입니다." };
    }
    return { ok: false, field: "form", message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const userId = created.user.id;
  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    role: "USER",
    name: input.name,
    phone,
    phone_verified_at: new Date().toISOString(),
    status: "ACTIVE",
  });

  if (profileErr) {
    console.error("[signUpUser] profiles insert 실패:", profileErr);
    // 프로필 생성 실패 → 고아 auth 유저 롤백
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, field: "form", message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return { ok: true };
}

/**
 * 파트너 회원가입 = 관리자가 발급한 계정(login_id) 활성화.
 * 비밀번호 설정 + 프로필(이름/전화/상태) 업데이트.
 */
export async function activatePartner(input: {
  loginId: string;
  password: string;
  name: string;
  phone: string;
}): Promise<SignUpResult> {
  const admin = createAdminClient();
  const phone = normalizePhone(input.phone);
  const loginId = input.loginId.trim();

  if (!isValidPhone(phone)) {
    return { ok: false, field: "phone", message: "올바른 휴대폰번호를 입력해 주세요." };
  }
  if (!(await isPhoneVerified(admin, phone))) {
    return { ok: false, field: "phone", message: "휴대폰 인증을 먼저 해주세요." };
  }

  const { data: account } = await admin
    .from("partner_accounts")
    .select("profile_id")
    .eq("login_id", loginId)
    .maybeSingle();

  if (!account) {
    return { ok: false, field: "loginId", message: "발급되지 않은 아이디입니다." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("status")
    .eq("id", account.profile_id)
    .maybeSingle();

  if (profile?.status === "ACTIVE") {
    return { ok: false, field: "loginId", message: "이미 가입이 완료된 아이디입니다." };
  }

  const { error: pwErr } = await admin.auth.admin.updateUserById(
    account.profile_id,
    { password: input.password },
  );
  if (pwErr) {
    return { ok: false, field: "form", message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const { error: upErr } = await admin
    .from("profiles")
    .update({
      name: input.name,
      phone,
      phone_verified_at: new Date().toISOString(),
      status: "ACTIVE",
    })
    .eq("id", account.profile_id);

  if (upErr) {
    return { ok: false, field: "form", message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return { ok: true };
}

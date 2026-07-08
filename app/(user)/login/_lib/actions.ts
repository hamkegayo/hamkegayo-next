"use server";

import { createClient } from "@/utils/supabase/server";
import { partnerEmail } from "@/lib/partner";

// 로그인 성공 후 이동 경로 (파트너 메인은 추후 작성 → 현재 준비 중 안내)
const USER_HOME = "/";

export type LoginResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message: string; tone?: "error" | "info" };

/** 일반 사용자 로그인 (이메일 + 비밀번호) */
export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<LoginResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.user) {
    return { ok: false, message: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  // 파트너 계정이 일반 로그인으로 들어오는 것 차단
  if (data.user.app_metadata?.role !== "USER") {
    await supabase.auth.signOut();
    return { ok: false, message: "일반 회원 계정이 아닙니다." };
  }

  return { ok: true, redirectTo: USER_HOME };
}

/** 파트너 로그인 (발급 아이디 → 합성 이메일 + 비밀번호) */
export async function loginPartner(input: {
  loginId: string;
  password: string;
}): Promise<LoginResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: partnerEmail(input.loginId),
    password: input.password,
  });

  if (error || !data.user) {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  if (data.user.app_metadata?.role !== "PARTNER") {
    await supabase.auth.signOut();
    return { ok: false, message: "파트너 계정이 아닙니다." };
  }

  // 파트너 메인 화면은 아직 준비 중 → 세션은 만들지 않고 안내만
  await supabase.auth.signOut();
  return { ok: false, message: "준비 중입니다.", tone: "info" };
}

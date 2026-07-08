"use server";

import { createClient } from "@/utils/supabase/server";

/** 로그아웃 — 세션 종료(쿠키 삭제) */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

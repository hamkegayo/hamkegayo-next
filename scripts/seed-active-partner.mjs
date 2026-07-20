// 바로 로그인 가능한 "활성(ACTIVE)" 파트너 테스트 계정 시드 스크립트.
// (기존 seed-partner.mjs 는 발급 후 /signup 활성화가 필요한 PENDING 계정을 만든다.
//  이 스크립트는 활성화 단계를 건너뛰고 곧바로 로그인 가능한 계정을 만든다.)
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/seed-active-partner.mjs
//   (env 파일명이 .env 라면 --env-file=.env)
//
// 옵션(환경변수):
//   PARTNER_LOGIN_ID (기본 partner01), PARTNER_PASSWORD (기본 partner1234!),
//   PARTNER_NAME (기본 박소연), PARTNER_PHONE (기본 01000000000)
//
// 필요: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 사전: accounts 마이그레이션 적용 필요. 멱등(재실행 시 비밀번호만 갱신).

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
  );
  console.error("   예) node --env-file=.env.local scripts/seed-active-partner.mjs");
  process.exit(1);
}

const LOGIN_ID = process.env.PARTNER_LOGIN_ID ?? "partner01";
const PASSWORD = process.env.PARTNER_PASSWORD ?? "partner1234!";
const NAME = process.env.PARTNER_NAME ?? "박소연";
const PHONE = process.env.PARTNER_PHONE ?? "01000000000";

// lib/partner.ts 의 partnerEmail() 과 동일한 규칙
const email = `${LOGIN_ID.trim().toLowerCase()}@partner.hamkegayo.internal`;

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // 이미 발급된 아이디인지 확인 (멱등)
  const { data: existing } = await admin
    .from("partner_accounts")
    .select("profile_id")
    .eq("login_id", LOGIN_ID)
    .maybeSingle();

  let userId;
  if (existing) {
    userId = existing.profile_id;
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
    });
    if (error) throw error;
    console.log("♻️  기존 계정 비밀번호를 갱신했습니다.");
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log("✅ Auth 사용자를 생성했습니다.");
  }

  // profiles: role=PARTNER 로 저장하면 트리거가 JWT(app_metadata.role) 를 동기화
  const { error: pErr } = await admin.from("profiles").upsert({
    id: userId,
    role: "PARTNER",
    name: NAME,
    phone: PHONE,
    phone_verified_at: new Date().toISOString(),
    status: "ACTIVE",
  });
  if (pErr) throw pErr;

  // partner_accounts: 로그인 아이디 매핑
  const { error: aErr } = await admin
    .from("partner_accounts")
    .upsert({ profile_id: userId, login_id: LOGIN_ID });
  if (aErr) throw aErr;

  console.log("\n🎉 파트너 테스트 계정 준비 완료");
  console.log(`   아이디   : ${LOGIN_ID}`);
  console.log(`   비밀번호 : ${PASSWORD}`);
  console.log("   로그인   : /login → 파트너 탭 → /partner 이동");
}

main().catch((e) => {
  console.error("❌ 실패:", e?.message ?? e);
  process.exit(1);
});

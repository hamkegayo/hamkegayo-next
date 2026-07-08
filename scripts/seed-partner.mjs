// 테스트용 파트너 계정(발급 아이디) 시드 스크립트
//
// 사용법 (Node 20.6+):
//   node --env-file=.env scripts/seed-partner.mjs [loginId]
//   예) node --env-file=.env scripts/seed-partner.mjs partner01
//
// 동작: 합성 이메일로 auth 유저 생성(PENDING) + profiles + partner_accounts 생성.
//       이후 /signup 의 "파트너 회원가입" 탭에서 이 loginId 로 활성화(비번 설정)한다.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "환경변수 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.\n" +
      "  node --env-file=.env scripts/seed-partner.mjs [loginId]",
  );
  process.exit(1);
}

const loginId = (process.argv[2] || "partner01").trim().toLowerCase();
const email = `${loginId}@partner.hamkegayo.internal`;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // 1) 임시 비번으로 auth 유저 생성 (활성화 때 실제 비번으로 교체됨)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    console.error("auth 유저 생성 실패:", createErr?.message);
    process.exit(1);
  }
  const id = created.user.id;

  // 2) 프로필 (PENDING). name 은 활성화 시 실제 이름으로 교체
  const { error: profileErr } = await admin.from("profiles").insert({
    id,
    role: "PARTNER",
    name: loginId,
    status: "PENDING",
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(id);
    console.error("profiles 생성 실패:", profileErr.message);
    process.exit(1);
  }

  // 3) 파트너 계정(발급 아이디)
  const { error: paErr } = await admin
    .from("partner_accounts")
    .insert({ profile_id: id, login_id: loginId });
  if (paErr) {
    await admin.auth.admin.deleteUser(id);
    console.error("partner_accounts 생성 실패:", paErr.message);
    process.exit(1);
  }

  console.log("✅ 파트너 계정 발급 완료");
  console.log(`   login_id : ${loginId}`);
  console.log(`   email    : ${email} (내부용)`);
  console.log(`   status   : PENDING → /signup 파트너 탭에서 활성화하세요.`);
}

main();

// 로컬 개발용 테스트 계정 시드 (일반 사용자 + 파트너).
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/seed-dev.mjs
//
// 사전 조건:
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) .env.local 이 로컬(127.0.0.1:54321) 블록을 가리킬 것
//
// 안전장치: NEXT_PUBLIC_SUPABASE_URL 이 localhost/127.0.0.1 이 아니면 즉시 중단한다.
// (원격·운영 프로젝트에 테스트 계정이 생기는 사고를 막기 위함)
//
// 옵션(환경변수):
//   USER_EMAIL     (기본 user01@example.com)   USER_PASSWORD (기본 user1234!)
//   PARTNER_LOGIN_ID (기본 partner01)          PARTNER_PASSWORD (기본 partner1234!)
//
// 멱등: 재실행하면 비밀번호/프로필만 갱신한다.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error(
        "❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
    );
    console.error("   예) node --env-file=.env.local scripts/seed-dev.mjs");
    process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error("❌ 로컬 스택이 아닙니다. 중단합니다.");
    console.error(`   현재 URL: ${url}`);
    console.error(
        "   .env.local 에서 로컬(127.0.0.1:54321) 블록의 주석을 해제하세요.",
    );
    process.exit(1);
}

const USER_EMAIL = process.env.USER_EMAIL ?? "user01@example.com";
const USER_PASSWORD = process.env.USER_PASSWORD ?? "user1234!";
const USER_NAME = process.env.USER_NAME ?? "김이용";
const USER_PHONE = process.env.USER_PHONE ?? "01011112222";

const LOGIN_ID = process.env.PARTNER_LOGIN_ID ?? "tpart01";
const PARTNER_PASSWORD = process.env.PARTNER_PASSWORD ?? "tpart1234!";
const PARTNER_NAME = process.env.PARTNER_NAME ?? "박소연";
const PARTNER_PHONE = process.env.PARTNER_PHONE ?? "01033334444";

// lib/partner.ts 의 partnerEmail() 과 동일한 규칙
const partnerEmail = `${LOGIN_ID.trim().toLowerCase()}@partner.hamkegayo.internal`;

const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
});

/** 이메일로 기존 auth 유저를 찾는다 (없으면 null) */
async function findUserByEmail(email) {
    // listUsers 는 페이지네이션이지만 로컬 테스트 규모에서는 1페이지로 충분하다.
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    return data.users.find((u) => u.email === email) ?? null;
}

/** auth 유저를 만들거나(있으면) 비밀번호만 갱신하고 id 를 돌려준다 */
async function upsertAuthUser(email, password) {
    const existing = await findUserByEmail(email);
    if (existing) {
        const { error } = await admin.auth.admin.updateUserById(existing.id, {
            password,
        });
        if (error) throw error;
        return { id: existing.id, created: false };
    }
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });
    if (error) throw error;
    return { id: data.user.id, created: true };
}

async function seedUser() {
    const { id, created } = await upsertAuthUser(USER_EMAIL, USER_PASSWORD);

    // role=USER 로 저장하면 트리거가 JWT(app_metadata.role) 를 동기화한다.
    const { error } = await admin.from("profiles").upsert({
        id,
        role: "USER",
        name: USER_NAME,
        email: USER_EMAIL,
        phone: USER_PHONE,
        phone_verified_at: new Date().toISOString(),
        status: "ACTIVE",
    });
    if (error) throw error;

    console.log(`${created ? "✅ 생성" : "♻️  갱신"} — 일반 사용자`);
}

async function seedPartner() {
    const { id, created } = await upsertAuthUser(
        partnerEmail,
        PARTNER_PASSWORD,
    );

    const { error: pErr } = await admin.from("profiles").upsert({
        id,
        role: "PARTNER",
        name: PARTNER_NAME,
        email: partnerEmail,
        phone: PARTNER_PHONE,
        phone_verified_at: new Date().toISOString(),
        status: "ACTIVE",
    });
    if (pErr) throw pErr;

    // partner_accounts: 로그인 아이디 매핑
    const { error: aErr } = await admin
        .from("partner_accounts")
        .upsert({ profile_id: id, login_id: LOGIN_ID });
    if (aErr) throw aErr;

    console.log(`${created ? "✅ 생성" : "♻️  갱신"} — 파트너`);
}

async function main() {
    await seedUser();
    await seedPartner();

    console.log("\n🎉 로컬 테스트 계정 준비 완료\n");
    console.log("  일반 사용자  /login → 일반 탭");
    console.log(`    이메일   : ${USER_EMAIL}`);
    console.log(`    비밀번호 : ${USER_PASSWORD}`);
    console.log("\n  파트너      /login → 파트너 탭");
    console.log(`    아이디   : ${LOGIN_ID}`);
    console.log(`    비밀번호 : ${PARTNER_PASSWORD}`);
}

main().catch((e) => {
    console.error("❌ 실패:", e?.message ?? e);
    process.exit(1);
});

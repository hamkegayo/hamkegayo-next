// 최초 관리자 계정 시드 (#50).
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/seed-admin.mjs
//
// 왜 스크립트가 필요한가:
//   관리자 권한 부여(admin_grant_role)는 이미 관리자인 사람만 호출할 수 있다.
//   최초 1명은 그 경로로 만들 수 없어 service_role 로 직접 심는다.
//   두 번째 관리자부터는 관리자 화면에서 발급한다.
//
// 운영 프로젝트에서는 이 스크립트를 쓰지 않는다.
//   Supabase 대시보드에서 사용자를 만든 뒤 SQL Editor 에서 아래를 실행한다.
//     update public.profiles set role = 'ADMIN' where id = '<uuid>';
//     insert into public.admin_accounts (profile_id) values ('<uuid>');
//     insert into public.admin_role_grants (target_id, action, reason)
//       values ('<uuid>', 'GRANT', '최초 관리자 지정');
//
// 안전장치: NEXT_PUBLIC_SUPABASE_URL 이 localhost/127.0.0.1 이 아니면 즉시 중단한다.
//
// 옵션(환경변수):
//   ADMIN_EMAIL (기본 admin01@example.com)  ADMIN_PASSWORD (기본 admin1234!)
//
// 멱등: 재실행하면 비밀번호와 권한만 다시 맞춘다.
//
// ⚠️ 로그인하려면 2단계 인증(TOTP)이 필요하다. 최초 로그인 시
//    /admin/login 에서 QR 을 스캔해 인증기를 등록하면 된다.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error(
        "❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
    );
    console.error("   예) node --env-file=.env.local scripts/seed-admin.mjs");
    process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error("❌ 로컬 스택이 아닙니다. 중단합니다.");
    console.error(`   현재 URL: ${url}`);
    console.error(
        "   운영 관리자는 대시보드에서 수동으로 지정합니다 (파일 상단 주석 참고).",
    );
    process.exit(1);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin01@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin1234!";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "정관리";

const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    return data.users.find((u) => u.email === email) ?? null;
}

async function main() {
    const existing = await findUserByEmail(ADMIN_EMAIL);

    let id;
    let created = false;
    if (existing) {
        const { error } = await admin.auth.admin.updateUserById(existing.id, {
            password: ADMIN_PASSWORD,
        });
        if (error) throw error;
        id = existing.id;
    } else {
        const { data, error } = await admin.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            email_confirm: true,
        });
        if (error) throw error;
        id = data.user.id;
        created = true;
    }

    // role=ADMIN 으로 저장하면 트리거가 JWT(app_metadata.role) 를 동기화한다.
    const { error: pErr } = await admin.from("profiles").upsert({
        id,
        role: "ADMIN",
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        status: "ACTIVE",
    });
    if (pErr) throw pErr;

    const { error: aErr } = await admin
        .from("admin_accounts")
        .upsert({ profile_id: id, duty: "전체", memo: "로컬 개발용 최초 관리자" });
    if (aErr) throw aErr;

    // 고시 제5조 ③ — 권한 부여 내역을 남긴다. 부여자가 없으므로 actor_id 는 null.
    const { data: grants, error: gErr } = await admin
        .from("admin_role_grants")
        .select("id")
        .eq("target_id", id)
        .eq("action", "GRANT")
        .limit(1);
    if (gErr) throw gErr;
    if (!grants?.length) {
        const { error } = await admin.from("admin_role_grants").insert({
            target_id: id,
            action: "GRANT",
            reason: "최초 관리자 지정 (seed-admin)",
        });
        if (error) throw error;
    }

    console.log(`${created ? "✅ 생성" : "♻️  갱신"} — 관리자`);
    console.log(`    이메일   : ${ADMIN_EMAIL}`);
    console.log(`    비밀번호 : ${ADMIN_PASSWORD}`);
    console.log("");
    console.log("👉 http://localhost:3000/admin/login 에서 로그인하세요.");
    console.log("   최초 로그인 시 인증 앱으로 QR 을 스캔해 2단계 인증을 등록합니다.");
}

main().catch((e) => {
    console.error("❌ 실패:", e.message ?? e);
    process.exit(1);
});

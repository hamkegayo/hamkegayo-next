// 동의 이력(user_agreements) 재현 테스트 (#58).
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/test-agreements.mjs
//
// 사전 조건:
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) `npx supabase db reset` 으로 마이그레이션이 적용돼 있을 것
//
// 안전장치: NEXT_PUBLIC_SUPABASE_URL 이 localhost/127.0.0.1 이 아니면 즉시 중단한다.
//
// 무엇을 지키려는 테스트인가
//   동의 이력은 **사용자가 고칠 수 없어야** 증거로서 의미가 있다.
//   그래서 조회만 열고 쓰기 정책은 두지 않았다. 이 경계가 깨지면
//   "동의를 받았다" 는 기록의 신뢰가 사라진다.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
    console.error(
        "❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다.",
    );
    process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error("❌ 로컬 스택이 아닙니다. 중단합니다.");
    console.error(`   현재 URL: ${url}`);
    process.exit(1);
}

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL_A = "agree-test-a@example.com";
const EMAIL_B = "agree-test-b@example.com";
const PASSWORD = "agree1234!";
const VERSION = "2026-09-03";

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
    if (ok) {
        passed += 1;
        console.log(`  PASS  ${label}`);
    } else {
        failed += 1;
        console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    }
}

async function findUserByEmail(email) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    return data?.users?.find((u) => u.email === email) ?? null;
}

/** 테스트 계정을 만든다 (있으면 지우고 다시) */
async function makeUser(email, name) {
    const existing = await findUserByEmail(email);
    if (existing) await admin.auth.admin.deleteUser(existing.id);

    const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
    });
    if (error) throw new Error(`계정 생성 실패(${email}): ${error.message}`);

    const userId = data.user.id;
    const { error: pErr } = await admin.from("profiles").insert({
        id: userId,
        role: "USER",
        name,
        email,
        phone: "01000000000",
        status: "ACTIVE",
    });
    if (pErr) throw new Error(`프로필 생성 실패(${email}): ${pErr.message}`);
    return userId;
}

async function cleanup() {
    for (const email of [EMAIL_A, EMAIL_B]) {
        const u = await findUserByEmail(email);
        if (u) await admin.auth.admin.deleteUser(u.id); // profiles·agreements 는 cascade
    }
}

/** lib/legal/agreements.ts 의 recordAgreements 와 같은 형태로 적재 */
function rowsFor(userId) {
    return ["SERVICE", "PRIVACY", "PERSONAL", "SENSITIVE"].map((type) => ({
        user_id: userId,
        agreement_type: type,
        version: VERSION,
    }));
}

async function main() {
    await cleanup();

    console.log("\n▶ 동의 이력 적재");

    const userA = await makeUser(EMAIL_A, "김동의");
    const userB = await makeUser(EMAIL_B, "이타인");

    const { error: insErr } = await admin
        .from("user_agreements")
        .upsert(rowsFor(userA), {
            onConflict: "user_id,agreement_type,version",
            ignoreDuplicates: true,
        });
    check("4종 동의가 적재된다", !insErr, insErr?.message);

    const { data: mine } = await admin
        .from("user_agreements")
        .select("agreement_type, version, agreed_at")
        .eq("user_id", userA);
    check("행이 4개 남는다", mine?.length === 4, `${mine?.length}건`);
    check(
        "네 유형이 모두 들어간다",
        ["SERVICE", "PRIVACY", "PERSONAL", "SENSITIVE"].every((t) =>
            mine?.some((r) => r.agreement_type === t),
        ),
    );
    check(
        "문서 시행일이 버전으로 남는다",
        mine?.every((r) => r.version === VERSION),
    );

    // 재가입·활성화 재시도에서 같은 버전이 다시 들어올 수 있다.
    const { error: dupErr } = await admin
        .from("user_agreements")
        .upsert(rowsFor(userA), {
            onConflict: "user_id,agreement_type,version",
            ignoreDuplicates: true,
        });
    const { count: afterDup } = await admin
        .from("user_agreements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userA);
    check("같은 버전 재동의는 쌓이지 않는다", !dupErr && afterDup === 4);

    // 개정되면 새 버전으로 한 행이 더 쌓여야 재동의 판별이 된다.
    const { error: newVerErr } = await admin.from("user_agreements").insert({
        user_id: userA,
        agreement_type: "SERVICE",
        version: "2027-01-01",
    });
    const { count: afterNewVer } = await admin
        .from("user_agreements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userA);
    check(
        "개정 버전은 이력으로 쌓인다",
        !newVerErr && afterNewVer === 5,
        newVerErr?.message,
    );

    const { error: badTypeErr } = await admin.from("user_agreements").insert({
        user_id: userA,
        agreement_type: "MARKETING",
        version: VERSION,
    });
    check("정의되지 않은 동의 유형은 거부된다", !!badTypeErr);

    console.log("\n▶ RLS 경계 — 동의 이력은 사용자가 고칠 수 없어야 한다");

    const user = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: loginErr } = await user.auth.signInWithPassword({
        email: EMAIL_A,
        password: PASSWORD,
    });
    if (loginErr) throw new Error(`로그인 실패: ${loginErr.message}`);

    const { data: readOwn } = await user
        .from("user_agreements")
        .select("agreement_type");
    check("본인 이력은 조회할 수 있다", (readOwn?.length ?? 0) === 5);

    await admin.from("user_agreements").insert(rowsFor(userB));
    const { data: readOther } = await user
        .from("user_agreements")
        .select("id")
        .eq("user_id", userB);
    check("남의 이력은 보이지 않는다", (readOther?.length ?? 0) === 0);

    const { error: selfInsErr } = await user.from("user_agreements").insert({
        user_id: (await user.auth.getUser()).data.user.id,
        agreement_type: "SERVICE",
        version: "9999-12-31",
    });
    check("스스로 동의 이력을 만들 수 없다", !!selfInsErr);

    const { error: selfDelErr, count: deleted } = await user
        .from("user_agreements")
        .delete({ count: "exact" })
        .eq("user_id", userA);
    check(
        "스스로 동의 이력을 지울 수 없다",
        !!selfDelErr || deleted === 0,
        `삭제 ${deleted}건`,
    );

    const { error: selfUpdErr, count: updated } = await user
        .from("user_agreements")
        .update({ version: "1999-01-01" }, { count: "exact" })
        .eq("user_id", userA);
    check(
        "스스로 동의 버전을 바꿀 수 없다",
        !!selfUpdErr || updated === 0,
        `수정 ${updated}건`,
    );

    console.log("\n▶ 탈퇴 시 정리");

    await user.auth.signOut();
    await admin.auth.admin.deleteUser(userB);
    const { count: orphan } = await admin
        .from("user_agreements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userB);
    check("계정이 지워지면 이력도 함께 지워진다", orphan === 0);

    await cleanup();
}

main()
    .then(() => {
        console.log(
            `\n${failed === 0 ? "🎉" : "⚠️"}  ${passed}건 통과 / ${failed}건 실패`,
        );
        process.exit(failed === 0 ? 0 : 1);
    })
    .catch(async (e) => {
        console.error("\n❌ 실행 실패:", e.message);
        await cleanup().catch(() => {});
        process.exit(1);
    });

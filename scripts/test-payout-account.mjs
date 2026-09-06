// 파트너 정산 계좌 재현 테스트 (#51) — 로컬 전용.
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/test-payout-account.mjs
//
// 사전 조건:
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) `node --env-file=.env.local scripts/seed-dev.mjs` 로 파트너 계정이 있을 것
//   3) .env.local 이 로컬(127.0.0.1:54321) 블록을 가리킬 것
//
// 이 테스트가 지키려는 것 한 줄:
//   전체 계좌번호는 사유를 적고 재인증한 관리자만, 기록을 남기고 볼 수 있다.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
    console.error(
        "❌ SUPABASE URL / ANON_KEY / SERVICE_ROLE_KEY 가 필요합니다.",
    );
    process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error(`❌ 로컬 스택이 아닙니다. 중단합니다. (${url})`);
    process.exit(1);
}

const USER_EMAIL = process.env.USER_EMAIL ?? "user01@example.com";
const USER_PASSWORD = process.env.USER_PASSWORD ?? "user1234!";
const PARTNER_LOGIN_ID = process.env.PARTNER_LOGIN_ID ?? "tpart01";
const PARTNER_PASSWORD = process.env.PARTNER_PASSWORD ?? "tpart1234!";
const partnerEmail = `${PARTNER_LOGIN_ID.trim().toLowerCase()}@partner.hamkegayo.internal`;

const ACCOUNT = "1002345678901";
const LAST4 = ACCOUNT.slice(-4);

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
    if (ok) {
        passed += 1;
        console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    } else {
        failed += 1;
        console.log(
            `  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ""}`,
        );
    }
}

async function signIn(email, password) {
    const c = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`${email} 로그인 실패: ${error.message}`);
    return c;
}

async function findUserId(email) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (!found) {
        throw new Error(
            `${email} 계정이 없습니다. 먼저 scripts/seed-dev.mjs 를 실행하세요.`,
        );
    }
    return found.id;
}

async function main() {
    const partnerId = await findUserId(partnerEmail);
    const partner = await signIn(partnerEmail, PARTNER_PASSWORD);
    const user = await signIn(USER_EMAIL, USER_PASSWORD);

    await admin.from("partner_payouts").delete().eq("partner_id", partnerId);

    // =============================================================
    console.log("\n▶ 등록 (파트너 본인)");
    // =============================================================
    const { data: saved, error: saveErr } = await partner.rpc(
        "upsert_my_payout_account",
        {
            p_bank_code: "004",
            p_bank_name: "KB국민은행",
            p_account_number: ACCOUNT,
            p_holder_name: "김파트너",
        },
    );
    check("계좌를 등록할 수 있다", !saveErr, saveErr?.message);
    check("뒷 4자리를 서버가 만든다", saved?.last4 === LAST4, saved?.last4);

    const { data: mine } = await partner.rpc("get_my_payout_account");
    const row = (mine ?? [])[0];
    check(
        "본인 조회에 뒷 4자리만 내려온다",
        row?.last4 === LAST4 && !("account_number" in (row ?? {})),
        JSON.stringify(row),
    );
    check("예금주는 그대로 보인다", row?.holder_name === "김파트너");

    // 형식 검증
    const { error: badAccount } = await partner.rpc(
        "upsert_my_payout_account",
        {
            p_bank_code: "004",
            p_bank_name: "KB국민은행",
            p_account_number: "123",
            p_holder_name: "김파트너",
        },
    );
    check(
        "짧은 계좌번호는 거절된다",
        badAccount?.message?.includes("invalid_account") === true,
        badAccount?.message,
    );

    const { error: badBank } = await partner.rpc("upsert_my_payout_account", {
        p_bank_code: "9999",
        p_bank_name: "없는은행",
        p_account_number: ACCOUNT,
        p_holder_name: "김파트너",
    });
    check(
        "은행코드 형식이 틀리면 거절된다",
        badBank?.message?.includes("invalid_bank") === true,
        badBank?.message,
    );

    // =============================================================
    console.log("\n▶ 접근 경계");
    // =============================================================
    const { data: leaked } = await partner
        .from("partner_payouts")
        .select("account_number");
    check(
        "본인도 테이블을 직접 읽을 수 없다 (RLS 정책 없음)",
        (leaked ?? []).length === 0,
    );

    const { error: userDenied } = await user.rpc("upsert_my_payout_account", {
        p_bank_code: "004",
        p_bank_name: "KB국민은행",
        p_account_number: ACCOUNT,
        p_holder_name: "일반회원",
    });
    check(
        "이용자는 정산 계좌를 등록할 수 없다",
        userDenied?.message?.includes("not_partner") === true,
        userDenied?.message,
    );

    const { data: userView } = await user.rpc("get_my_payout_account");
    check(
        "이용자 조회는 비어 있다 (남의 계좌가 새지 않는다)",
        (userView ?? []).length === 0,
    );

    const { error: listDenied } = await partner.rpc(
        "admin_list_payout_accounts",
    );
    check(
        "파트너는 관리자 목록을 볼 수 없다",
        !!listDenied,
        listDenied?.message,
    );

    const { error: revealDenied } = await partner.rpc(
        "admin_reveal_payout_account",
        { p_partner_id: partnerId, p_reason: "그냥 궁금해서" },
    );
    check(
        "파트너는 전체 계좌번호를 열람할 수 없다",
        !!revealDenied,
        revealDenied?.message,
    );

    // service_role 은 RLS 를 우회하지만 auth.uid() 가 없다 —
    // 세션 없는 호출이 관리자 판정을 통과하지 않는지 본다.
    const { error: anonReveal } = await admin.rpc(
        "admin_reveal_payout_account",
        { p_partner_id: partnerId, p_reason: "세션 없는 호출" },
    );
    check("세션 없는 호출도 열람할 수 없다", !!anonReveal, anonReveal?.message);

    // =============================================================
    console.log("\n▶ 계좌 변경 시 검증 해제");
    // =============================================================
    await admin
        .from("partner_payouts")
        .update({ verified_at: new Date().toISOString() })
        .eq("partner_id", partnerId);

    // 같은 계좌로 예금주만 바꾸면 검증은 유지된다.
    await partner.rpc("upsert_my_payout_account", {
        p_bank_code: "004",
        p_bank_name: "KB국민은행",
        p_account_number: ACCOUNT,
        p_holder_name: "김파트너2",
    });
    const { data: same } = await admin
        .from("partner_payouts")
        .select("verified_at")
        .eq("partner_id", partnerId)
        .single();
    check("같은 계좌면 검증이 유지된다", !!same?.verified_at);

    // 계좌가 바뀌면 검증이 풀려야 한다 — 검증한 것은 이전 계좌였다.
    await partner.rpc("upsert_my_payout_account", {
        p_bank_code: "088",
        p_bank_name: "신한은행",
        p_account_number: "110987654321",
        p_holder_name: "김파트너2",
    });
    const { data: changed } = await admin
        .from("partner_payouts")
        .select("verified_at, account_last4, bank_name")
        .eq("partner_id", partnerId)
        .single();
    check(
        "계좌가 바뀌면 예금주 검증이 풀린다",
        changed?.verified_at === null,
        JSON.stringify(changed),
    );
    check(
        "뒷 4자리도 함께 갱신된다",
        changed?.account_last4 === "4321",
        changed?.account_last4,
    );

    // =============================================================
    console.log("\n▶ 하이픈 정규화");
    // =============================================================
    await partner.rpc("upsert_my_payout_account", {
        p_bank_code: "004",
        p_bank_name: "KB국민은행",
        p_account_number: "100-234-567890",
        p_holder_name: "김파트너",
    });
    const { data: normalized } = await admin
        .from("partner_payouts")
        .select("account_number, account_last4")
        .eq("partner_id", partnerId)
        .single();
    check(
        "하이픈이 섞여도 숫자만 저장된다",
        normalized?.account_number === "100234567890" &&
            normalized?.account_last4 === "7890",
        JSON.stringify(normalized),
    );

    await admin.from("partner_payouts").delete().eq("partner_id", partnerId);

    console.log(
        `\n${failed === 0 ? "🎉" : "⚠️"}  ${passed}건 통과 / ${failed}건 실패`,
    );
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("\n💥 실행 중 오류:", e);
    process.exit(1);
});

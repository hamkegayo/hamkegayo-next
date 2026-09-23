// ADMIN 권한·접근통제·접속기록 재현 테스트 (#50) — 로컬 전용.
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/test-admin-access.mjs
//
// 사전 조건:
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) `npm run seed:dev` 로 일반 사용자·파트너 계정이 있을 것
//   3) .env.local 이 로컬(127.0.0.1:54321) 블록을 가리킬 것
//
// 안전장치: NEXT_PUBLIC_SUPABASE_URL 이 localhost/127.0.0.1 이 아니면 즉시 중단한다.
//
// 무엇을 검증하는가:
//   이 이슈의 핵심은 "무엇이 되는가" 보다 "무엇이 안 되는가" 다.
//   권한 상승이 막혔는지, 관리자가 이용자 건강정보를 못 보는지,
//   2단계 인증 없이는 DB 가 거절하는지를 실제 로그인 세션으로 확인한다.
//
//   2단계 인증까지 재현하려고 TOTP 코드를 직접 계산한다(아래 totp()).
//   외부 의존성 없이 표준 RFC 6238 구현이다.
//
// 멱등: 이 스크립트가 만든 것만 지운다.
//   - 관리자   : ADMIN_EMAIL 계정 (기본 admin-test-50@example.com)
//   - 예약     : code 가 TEST-50 으로 시작하는 행
//   - 접속기록 : 위 관리자가 남긴 행
// 반복 실행해도 안전하다.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
    console.error(
        "❌ NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY 가 필요합니다.",
    );
    console.error(
        "   예) node --env-file=.env.local scripts/test-admin-access.mjs",
    );
    process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error("❌ 로컬 스택이 아닙니다. 중단합니다.");
    console.error(`   현재 URL: ${url}`);
    process.exit(1);
}

const USER_EMAIL = process.env.USER_EMAIL ?? "user01@example.com";
const USER_PASSWORD = process.env.USER_PASSWORD ?? "user1234!";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "admin-test-50@example.com";
const ADMIN_PASSWORD = "adminTest50!";
/** 승격 대상으로 쓸 전용(이용 이력 없는) 계정 — #56 의 계정 발급이 만들 형태 */
const DEDICATED_EMAIL = "admin-new-50@example.com";
const ISSUED_PARTNER_EMAIL = "issued-partner-56@partner.hamkegayo.internal";
const ISSUED_PARTNER_LOGIN = "issued-partner-56";
const CODE_PREFIX = "TEST-50";

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------
// 결과 집계
// ---------------------------------------------------------------
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

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ---------------------------------------------------------------
// TOTP (RFC 6238) — 2단계 인증을 스크립트에서 통과하기 위해
// ---------------------------------------------------------------
function base32Decode(input) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of input.replace(/=+$/, "").toUpperCase()) {
        const idx = alphabet.indexOf(ch);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

function totp(secret, atMs = Date.now()) {
    const counter = Math.floor(atMs / 1000 / 30);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto
        .createHmac("sha1", base32Decode(secret))
        .update(buf)
        .digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
        (((hmac[offset] & 0x7f) << 24) |
            (hmac[offset + 1] << 16) |
            (hmac[offset + 2] << 8) |
            hmac[offset + 3]) %
        1_000_000;
    return String(code).padStart(6, "0");
}

// ---------------------------------------------------------------
// 준비 / 정리
// ---------------------------------------------------------------
async function findUserByEmail(email) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    return data.users.find((u) => u.email === email) ?? null;
}

async function cleanup(adminId) {
    if (adminId) {
        await admin.from("transfer_batches").delete().eq("created_by", adminId);
    }
    await admin
        .from("payment_incidents")
        .delete()
        .like("order_id", `${CODE_PREFIX}%`);
    await admin.from("reservations").delete().like("code", `${CODE_PREFIX}%`);
    if (adminId) {
        await admin.from("access_logs").delete().eq("actor_id", adminId);
        await admin.from("admin_role_grants").delete().eq("target_id", adminId);
        await admin.from("admin_accounts").delete().eq("profile_id", adminId);
    }
    // 승격 테스트용 전용 계정 — profiles/admin_* 는 cascade 로 함께 지워진다
    const dedicated = await findUserByEmail(DEDICATED_EMAIL);
    if (dedicated) await admin.auth.admin.deleteUser(dedicated.id);
    const issuedPartner = await findUserByEmail(ISSUED_PARTNER_EMAIL);
    if (issuedPartner) await admin.auth.admin.deleteUser(issuedPartner.id);
}

/** 테스트용 관리자 계정을 만들고 2단계 인증까지 마친 클라이언트를 돌려준다 */
async function makeVerifiedAdmin() {
    const existing = await findUserByEmail(ADMIN_EMAIL);
    let id;
    if (existing) {
        id = existing.id;
        await admin.auth.admin.updateUserById(id, { password: ADMIN_PASSWORD });
        // 이전 실행에서 남은 인증기를 지워 매번 같은 상태에서 시작한다
        const { data: factors } = await admin.auth.admin.mfa.listFactors({
            userId: id,
        });
        for (const f of factors?.factors ?? []) {
            await admin.auth.admin.mfa.deleteFactor({ userId: id, id: f.id });
        }
    } else {
        const { data, error } = await admin.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            email_confirm: true,
        });
        if (error) throw error;
        id = data.user.id;
    }

    await admin.from("profiles").upsert({
        id,
        role: "ADMIN",
        name: "테스트관리자",
        email: ADMIN_EMAIL,
        status: "ACTIVE",
    });

    // aal1 세션
    const client = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: sErr } = await client.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
    });
    if (sErr) throw sErr;

    return { id, client };
}

async function upgradeToAal2(client) {
    const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `test-50-${Date.now()}`,
    });
    if (error) throw error;

    const { error: vErr } = await client.auth.mfa.challengeAndVerify({
        factorId: data.id,
        code: totp(data.totp.secret),
    });
    if (vErr) throw vErr;
}

// ---------------------------------------------------------------
// 본문
// ---------------------------------------------------------------
async function main() {
    console.log("\x1b[1m#50 ADMIN 권한 · 접근통제 · 접속기록 검증\x1b[0m");

    const previous = await findUserByEmail(ADMIN_EMAIL);
    await cleanup(previous?.id);

    // =============================================================
    section("1. 권한 상승 차단 — 이게 이 이슈의 출발점이다");
    // =============================================================
    const userClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userAuth, error: uErr } =
        await userClient.auth.signInWithPassword({
            email: USER_EMAIL,
            password: USER_PASSWORD,
        });
    if (uErr) {
        console.error(
            `❌ 일반 사용자 로그인 실패: ${uErr.message}\n   먼저 npm run seed:dev 를 실행하세요.`,
        );
        process.exit(1);
    }
    const userId = userAuth.user.id;

    const roleUp = await userClient
        .from("profiles")
        .update({ role: "ADMIN" })
        .eq("id", userId)
        .select("id");
    check(
        "일반 사용자가 자기 role 을 ADMIN 으로 바꿀 수 없음",
        !!roleUp.error || (roleUp.data ?? []).length === 0,
        roleUp.error ? undefined : "업데이트가 통과했다",
    );

    const statusUp = await userClient
        .from("profiles")
        .update({ status: "SUSPENDED" })
        .eq("id", userId)
        .select("id");
    check(
        "일반 사용자가 자기 status 를 바꿀 수 없음",
        !!statusUp.error || (statusUp.data ?? []).length === 0,
    );

    const verifiedUp = await userClient
        .from("profiles")
        .update({ phone_verified_at: new Date().toISOString() })
        .eq("id", userId)
        .select("id");
    check(
        "일반 사용자가 스스로 휴대전화 인증 완료로 만들 수 없음",
        !!verifiedUp.error || (verifiedUp.data ?? []).length === 0,
    );

    // 기능 회귀 — 이름 변경은 계속 되어야 한다
    const { data: before } = await admin
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .single();
    const nameUp = await userClient
        .from("profiles")
        .update({ name: before.name })
        .eq("id", userId)
        .select("id");
    check(
        "일반 사용자의 이름 변경은 계속 동작 (기능 회귀 없음)",
        !nameUp.error && (nameUp.data ?? []).length === 1,
        nameUp.error?.message,
    );

    // DB 에 실제로 반영되지 않았는지 확인
    const { data: after } = await admin
        .from("profiles")
        .select("role, status")
        .eq("id", userId)
        .single();
    check(
        `자가 승격 시도 후에도 role 이 그대로 (${after.role}/${after.status})`,
        after.role === "USER" && after.status === "ACTIVE",
    );

    // =============================================================
    section("2. 2단계 인증 — aal1 세션은 관리자로 인정하지 않는다");
    // =============================================================
    const { id: adminId, client: adminClient } = await makeVerifiedAdmin();

    const aal1IsAdmin = await adminClient.rpc("is_admin");
    check(
        "aal1 관리자 세션에서 is_admin() = false",
        aal1IsAdmin.data === false,
        `실제 ${JSON.stringify(aal1IsAdmin.data)}`,
    );

    const aal1Logs = await adminClient.from("access_logs").select("id");
    check(
        "aal1 관리자는 접속기록을 읽지 못함",
        !aal1Logs.error && (aal1Logs.data ?? []).length === 0,
    );

    const aal1Rpc = await adminClient.rpc("admin_list_reservations", {});
    check("aal1 관리자는 예약 목록 RPC 거절됨", !!aal1Rpc.error);

    await admin
        .from("admin_accounts")
        .upsert({ profile_id: adminId, duty: "심사" });
    const aal1Review = await adminClient.rpc("can_review_qualifications");
    check(
        "심사 담당이어도 2단계 인증 전에는 심사 불가",
        aal1Review.data === false,
    );
    await upgradeToAal2(adminClient);

    const aal2IsAdmin = await adminClient.rpc("is_admin");
    check("2단계 인증 후 is_admin() = true", aal2IsAdmin.data === true);

    const aal2Live = await adminClient.rpc("is_admin_live");
    check("2단계 인증 후 is_admin_live() = true", aal2Live.data === true);

    const issuedPartner = await admin.auth.admin.createUser({
        email: ISSUED_PARTNER_EMAIL,
        password: "issuedPartner56!",
        email_confirm: true,
    });
    if (issuedPartner.error) throw issuedPartner.error;
    const issuedPartnerId = issuedPartner.data.user.id;
    const deniedIssue = await adminClient.rpc(
        "admin_register_partner_account",
        {
            p_target: issuedPartnerId,
            p_login_id: ISSUED_PARTNER_LOGIN,
            p_reason: "TEST-56 파트너 전용 계정 발급",
        },
    );
    check("심사 담당은 계정 발급 불가", deniedIssue.error?.code === "42501");
    await admin
        .from("admin_accounts")
        .update({ duty: "계정" })
        .eq("profile_id", adminId);
    const issueAllowed = await adminClient.rpc("can_issue_accounts");
    check("계정 담당은 MFA 후 계정 발급 가능", issueAllowed.data === true);
    const issued = await adminClient.rpc("admin_register_partner_account", {
        p_target: issuedPartnerId,
        p_login_id: ISSUED_PARTNER_LOGIN.toUpperCase(),
        p_reason: "TEST-56 파트너 전용 계정 발급",
    });
    check(
        "파트너 가입 대기 계정 발급 성공",
        !issued.error,
        issued.error?.message,
    );
    const [issuedProfile, issuedAccount, issuedLog] = await Promise.all([
        admin
            .from("profiles")
            .select("role, status")
            .eq("id", issuedPartnerId)
            .single(),
        admin
            .from("partner_accounts")
            .select("login_id")
            .eq("profile_id", issuedPartnerId)
            .single(),
        admin
            .from("access_logs")
            .select("action, actor_id")
            .eq("target_id", issuedPartnerId)
            .maybeSingle(),
    ]);
    check(
        "발급 계정은 PARTNER/PENDING 상태",
        issuedProfile.data?.role === "PARTNER" &&
            issuedProfile.data?.status === "PENDING",
    );
    check(
        "대문자 입력도 소문자로 정규화해 발급 아이디 저장",
        issuedAccount.data?.login_id === ISSUED_PARTNER_LOGIN,
    );
    check(
        "계정 발급자 접속기록 저장",
        issuedLog.data?.action === "PARTNER_ACCOUNT_ISSUE" &&
            issuedLog.data?.actor_id === adminId,
    );

    // =============================================================
    section("3. 관리자가 볼 수 없어야 하는 것 (처리방침 제10조 3)");
    // =============================================================

    // 확인용 데이터를 서비스 롤로 심는다
    const { data: partnerRow } = await admin
        .from("partner_accounts")
        .select("profile_id")
        .limit(1)
        .maybeSingle();
    if (!partnerRow) {
        console.error(
            "❌ 파트너 계정이 없습니다. npm run seed:dev 를 먼저 실행하세요.",
        );
        process.exit(1);
    }
    const partnerId = partnerRow.profile_id;

    const { data: seededRes, error: resErr } = await admin
        .from("reservations")
        .insert({
            code: `${CODE_PREFIX}-0001`,
            customer_id: userId,
            plan: "basic",
            patient_name: "환자테스트",
            patient_birth: "1950-03-01",
            patient_gender: "female",
            patient_phone: "01099998888",
            guardian_name: "보호자테스트",
            guardian_phone: "01088887777",
            relation: "자녀",
            treatment: "정형외과",
            purpose: "무릎 통증 검사",
            cautions: "보행 보조 필요",
            use_date: "2026-12-01",
            arrive_time: "09:00",
            reserve_time: "10:00",
            duration: "2시간",
            duration_minutes: 120,
            depart_address: "서울시 테스트구 테스트로 1",
            hospital_address: "서울시 테스트구 병원로 2",
        })
        .select("id")
        .single();
    if (resErr) throw resErr;

    const { data: seededCare } = await admin
        .from("care_recipients")
        .insert({ user_id: userId, name: "보호대상테스트", relation: "부" })
        .select("id")
        .single();

    const careRead = await adminClient.from("care_recipients").select("id");
    check(
        "관리자는 care_recipients 를 읽지 못함",
        !careRead.error && (careRead.data ?? []).length === 0,
        `${(careRead.data ?? []).length}건 보임`,
    );

    const reportRead = await adminClient.from("reports").select("id");
    check(
        "관리자는 reports 를 읽지 못함",
        !reportRead.error && (reportRead.data ?? []).length === 0,
    );

    const resRead = await adminClient.from("reservations").select("id");
    check(
        "관리자는 reservations 를 직접 읽지 못함",
        !resRead.error && (resRead.data ?? []).length === 0,
        `${(resRead.data ?? []).length}건 보임`,
    );

    const svcRead = await adminClient.from("services").select("id");
    check(
        "관리자는 services 를 직접 읽지 못함 (수행 메모 보호)",
        !svcRead.error && (svcRead.data ?? []).length === 0,
    );

    // 정산 검증에 필요한 시각만 RPC 로 연다 — 메모는 빠져야 한다
    const { data: seededSvc, error: svcErr } = await admin
        .from("services")
        .insert({
            reservation_id: seededRes.id,
            partner_id: partnerId,
            status: "COMPLETED",
            started_at: "2026-12-01T01:00:00Z",
            arrived_at: "2026-12-01T00:40:00Z",
            ended_at: "2026-12-01T03:10:00Z",
            start_memo: "메모테스트-시작",
            end_memo: "메모테스트-종료",
        })
        .select("id")
        .single();
    if (svcErr) throw svcErr;

    const svcList = await adminClient.rpc("admin_list_services", {
        p_limit: 50,
    });
    check(
        "admin_list_services() 로 수행 시각은 볼 수 있음",
        !svcList.error &&
            (svcList.data ?? []).some((s) => s.id === seededSvc.id),
        svcList.error?.message,
    );

    const svcRow =
        (svcList.data ?? []).find((s) => s.id === seededSvc.id) ?? {};
    check(
        "시각 3종(도착·시작·종료)이 모두 반환됨",
        !!svcRow.arrived_at && !!svcRow.started_at && !!svcRow.ended_at,
    );
    const svcLeaked = ["start_memo", "end_memo"].filter((k) => k in svcRow);
    check(
        "수행 메모는 반환되지 않음",
        svcLeaked.length === 0,
        `노출된 컬럼: ${svcLeaked.join(", ")}`,
    );

    // =============================================================
    section("4. 관리자가 볼 수 있어야 하는 것 (계정 · 심사 · 정산)");
    // =============================================================
    const profRead = await adminClient.from("profiles").select("id").limit(5);
    check(
        "관리자는 profiles 를 조회 가능",
        !profRead.error && (profRead.data ?? []).length > 1,
    );

    for (const table of [
        "partner_accounts",
        "partner_qualifications",
        "settlements",
        "payments",
        "points",
    ]) {
        const r = await adminClient.from(table).select("*").limit(1);
        check(`관리자는 ${table} 을(를) 조회 가능`, !r.error, r.error?.message);
    }

    // =============================================================
    section("4-1. 정산 담당 목록·보류·일괄 승인 (#56)");
    // =============================================================
    const { data: previousPayout } = await admin
        .from("partner_payouts")
        .select("*")
        .eq("partner_id", partnerId)
        .maybeSingle();
    await admin.from("partner_payouts").upsert({
        partner_id: partnerId,
        bank_code: "004",
        bank_name: "국민은행",
        account_number: "123456789012",
        account_last4: "9012",
        holder_name: "테스트파트너",
    });
    const { data: settlement, error: settlementError } = await admin
        .from("settlements")
        .insert({
            service_id: seededSvc.id,
            partner_id: partnerId,
            amount: 40000,
            fee: 0,
            net: 40000,
            reason: "SERVICE_COMPLETED",
        })
        .select("id")
        .single();
    if (settlementError) throw settlementError;

    await admin
        .from("admin_accounts")
        .update({ duty: "심사" })
        .eq("profile_id", adminId);
    const deniedSettlement = await adminClient.rpc("can_manage_settlements");
    check("심사 담당은 정산 관리 불가", deniedSettlement.data === false);
    await admin
        .from("admin_accounts")
        .update({ duty: "정산" })
        .eq("profile_id", adminId);
    const settlementList = await adminClient.rpc("admin_list_settlements", {
        p_partner: partnerId,
        p_limit: 20,
    });
    check(
        "정산 담당은 필터 목록 조회 가능",
        !settlementList.error &&
            settlementList.data?.some((row) => row.id === settlement.id),
        settlementList.error?.message,
    );
    const approvedSettlement = await adminClient.rpc(
        "admin_approve_settlements",
        {
            p_ids: [settlement.id],
            p_reason: "TEST-56 지급 조건 확인 완료",
        },
    );
    check(
        "계좌·서비스 조건을 충족한 정산 승인",
        approvedSettlement.data === 1,
        approvedSettlement.error?.message,
    );
    const heldSettlement = await adminClient.rpc("admin_hold_settlements", {
        p_ids: [settlement.id],
        p_reason: "TEST-56 재검토를 위한 보류",
    });
    check("승인 건 보류 가능", heldSettlement.data === 1);
    const releasedSettlement = await adminClient.rpc(
        "admin_release_settlements",
        {
            p_ids: [settlement.id],
            p_reason: "TEST-56 보류 사유 해소",
        },
    );
    check("보류 건 검토 대기 복귀", releasedSettlement.data === 1);
    await admin.from("partner_payouts").delete().eq("partner_id", partnerId);
    const noAccountApproval = await adminClient.rpc(
        "admin_approve_settlements",
        {
            p_ids: [settlement.id],
            p_reason: "TEST-56 계좌 없는 승인 차단",
        },
    );
    check(
        "정산 계좌가 없으면 승인 불가",
        noAccountApproval.error?.code === "23514",
    );
    if (previousPayout) {
        await admin.from("partner_payouts").insert(previousPayout);
    } else {
        await admin.from("partner_payouts").insert({
            partner_id: partnerId,
            bank_code: "004",
            bank_name: "국민은행",
            account_number: "123456789012",
            account_last4: "9012",
            holder_name: "테스트파트너",
        });
    }

    const reapprovedSettlement = await adminClient.rpc(
        "admin_approve_settlements",
        {
            p_ids: [settlement.id],
            p_reason: "TEST-56 이체 배치 생성 전 재승인",
        },
    );
    check("계좌 복구 후 정산 재승인", reapprovedSettlement.data === 1);
    const transferBatch = await adminClient.rpc("admin_create_transfer_batch", {
        p_ids: [settlement.id],
        p_reason: "TEST-56 승인 정산 이체 배치 생성",
    });
    check(
        "승인 정산을 파트너별 이체 배치로 생성",
        !transferBatch.error &&
            transferBatch.data?.settlementCount === 1 &&
            transferBatch.data?.partnerCount === 1 &&
            transferBatch.data?.totalNet === 40000,
        transferBatch.error?.message,
    );
    const duplicateBatch = await adminClient.rpc(
        "admin_create_transfer_batch",
        {
            p_ids: [settlement.id],
            p_reason: "TEST-56 동일 정산 중복 편입 차단",
        },
    );
    check(
        "동일 정산의 중복 배치 편입 차단",
        duplicateBatch.error?.code === "23514",
    );
    const batchedHold = await adminClient.rpc("admin_hold_settlements", {
        p_ids: [settlement.id],
        p_reason: "TEST-56 배치 편입 뒤 보류 차단",
    });
    check(
        "활성 배치에 편입된 정산의 보류 차단",
        batchedHold.error?.code === "23514",
    );
    const sameAdminIssue = await adminClient.rpc("admin_issue_transfer_file", {
        p_batch_id: transferBatch.data?.id,
        p_reason: "TEST-56 생성자 파일 발급 차단",
    });
    check(
        "배치 생성자는 이체 파일 발급 불가",
        sameAdminIssue.error?.code === "42501",
    );
    // 두 번째 관리자 역할을 재현하기 위해 생성자만 다른 프로필로 바꾼다.
    await admin
        .from("transfer_batches")
        .update({ created_by: partnerId })
        .eq("id", transferBatch.data?.id);
    const issuedFile = await adminClient.rpc("admin_issue_transfer_file", {
        p_batch_id: transferBatch.data?.id,
        p_reason: "TEST-56 두 번째 담당자 이체 파일 발급",
    });
    check(
        "두 번째 정산 담당자는 이체 파일 발급 가능",
        !issuedFile.error &&
            issuedFile.data?.[0]?.account_number === "123456789012",
        issuedFile.error?.message,
    );
    const issuedBatch = await admin
        .from("transfer_batches")
        .select("status, issued_by, issued_at, last_downloaded_at")
        .eq("id", transferBatch.data?.id)
        .single();
    check(
        "파일 발급 시 배치 잠금과 발급 이력 기록",
        issuedBatch.data?.status === "FILE_ISSUED" &&
            issuedBatch.data?.issued_by === adminId &&
            !!issuedBatch.data?.issued_at &&
            !!issuedBatch.data?.last_downloaded_at,
        issuedBatch.error?.message,
    );
    await admin
        .from("transfer_batches")
        .update({ created_by: adminId })
        .eq("id", transferBatch.data?.id);
    const transferItems = await adminClient.rpc(
        "admin_list_transfer_batch_items",
        { p_batch_id: transferBatch.data?.id },
    );
    const transferItem = transferItems.data?.[0] ?? {};
    check(
        "이체 배치 목록은 계좌 끝 4자리만 반환",
        !transferItems.error &&
            transferItem.account_last4 === "9012" &&
            !("account_number" in transferItem),
        transferItems.error?.message,
    );

    // =============================================================
    section("5. 예약 RPC — 개인정보를 반환하지 않는다");
    // =============================================================
    const list = await adminClient.rpc("admin_list_reservations", {
        p_limit: 50,
    });
    check(
        "admin_list_reservations() 로는 예약이 보임",
        !list.error && (list.data ?? []).length > 0,
        list.error?.message,
    );

    const row = (list.data ?? [])[0] ?? {};
    const leaked = [
        "patient_name",
        "patient_phone",
        "guardian_name",
        "guardian_phone",
        "treatment",
        "purpose",
        "cautions",
        "depart_address",
        "hospital_address",
    ].filter((k) => k in row);
    check(
        "목록에 개인정보 컬럼이 하나도 없음",
        leaked.length === 0,
        `노출된 컬럼: ${leaked.join(", ")}`,
    );

    // =============================================================
    section("5-1. 결제 사고 추적 — 목록·상태·고객 안내 (#80)");
    // =============================================================
    const { data: incident, error: incidentSeedError } = await admin
        .from("payment_incidents")
        .insert({
            reservation_id: seededRes.id,
            order_id: `${CODE_PREFIX}-PAYMENT`,
            kind: "CANCEL_FAILED",
            severity: "CRITICAL",
            amount: 20000,
            detail: { gatewayCode: "TEST", gatewayMessage: "테스트 오류" },
        })
        .select("id")
        .single();
    if (incidentSeedError) throw incidentSeedError;

    const directIncident = await adminClient
        .from("payment_incidents")
        .select("id")
        .eq("id", incident.id);
    check(
        "관리자도 payment_incidents를 직접 조회하지 못함",
        !directIncident.error && (directIncident.data ?? []).length === 0,
        directIncident.error?.message,
    );
    const directIncidentActions = await adminClient
        .from("payment_incident_actions")
        .select("id")
        .eq("incident_id", incident.id);
    check(
        "관리자도 payment_incident_actions를 직접 조회하지 못함",
        !!directIncidentActions.error ||
            (directIncidentActions.data ?? []).length === 0,
        directIncidentActions.error?.message,
    );

    const incidentSummary = await adminClient.rpc(
        "admin_payment_incident_summary",
    );
    check(
        "대시보드 요약에 미처리 최상 사고가 집계됨",
        !incidentSummary.error &&
            Number(incidentSummary.data?.[0]?.open_count ?? 0) >= 1 &&
            Number(incidentSummary.data?.[0]?.critical_count ?? 0) >= 1,
        incidentSummary.error?.message,
    );

    const incidentList = await adminClient.rpc("admin_list_payment_incidents", {
        p_status: null,
    });
    check(
        "관리자 RPC로 PG 응답과 관련 예약을 조회할 수 있음",
        !incidentList.error &&
            (incidentList.data ?? []).some(
                (row) =>
                    row.id === incident.id &&
                    row.reservation_id === seededRes.id &&
                    row.detail?.gatewayCode === "TEST",
            ),
        incidentList.error?.message,
    );

    const skippedState = await adminClient.rpc(
        "admin_update_payment_incident",
        {
            p_id: incident.id,
            p_status: "RESOLVED",
            p_memo: "중간 단계 생략 시도",
        },
    );
    check("OPEN에서 RESOLVED로 바로 변경할 수 없음", !!skippedState.error);

    const acknowledged = await adminClient.rpc(
        "admin_update_payment_incident",
        {
            p_id: incident.id,
            p_status: "ACKNOWLEDGED",
            p_memo: "PG 관리자 콘솔 확인 시작",
        },
    );
    check(
        "OPEN 사고를 ACKNOWLEDGED로 변경할 수 있음",
        !acknowledged.error,
        acknowledged.error?.message,
    );

    const nullContactMethod = await adminClient.rpc(
        "admin_record_payment_incident_contact",
        {
            p_id: incident.id,
            p_method: null,
            p_note: "안내 수단 누락",
        },
    );
    check("고객 안내 수단이 NULL이면 거절됨", !!nullContactMethod.error);

    const contacted = await adminClient.rpc(
        "admin_record_payment_incident_contact",
        {
            p_id: incident.id,
            p_method: "PHONE",
            p_note: "TEST_PAYMENT_CONTACT_NOTE",
        },
    );
    check(
        "고객 안내 방법·내용을 기록할 수 있음",
        !contacted.error,
        contacted.error?.message,
    );

    const incidentResolved = await adminClient.rpc(
        "admin_update_payment_incident",
        {
            p_id: incident.id,
            p_status: "RESOLVED",
            p_memo: "PG 콘솔 확인 및 고객 안내 완료",
        },
    );
    check(
        "ACKNOWLEDGED 사고를 RESOLVED로 변경할 수 있음",
        !incidentResolved.error,
        incidentResolved.error?.message,
    );

    const resolvedList = await adminClient.rpc("admin_list_payment_incidents", {
        p_status: "RESOLVED",
    });
    const resolvedIncident = (resolvedList.data ?? []).find(
        (row) => row.id === incident.id,
    );
    check(
        "상태 변경 2건과 고객 안내 1건이 불변 이력으로 조회됨",
        !resolvedList.error && resolvedIncident?.history?.length === 3,
        resolvedList.error?.message ??
            `history=${resolvedIncident?.history?.length ?? 0}`,
    );

    const noReason = await adminClient.rpc("admin_get_reservation", {
        p_id: seededRes.id,
        p_reason: "   ",
    });
    check("사유 없는 상세 열람은 거절됨", !!noReason.error);

    const incidentReservation = await adminClient.rpc(
        "admin_get_payment_incident_reservation",
        { p_incident_id: incident.id },
    );
    check(
        "결제 사고와 실제 연결된 예약만 상세 열람 가능",
        !incidentReservation.error &&
            incidentReservation.data?.id === seededRes.id,
        incidentReservation.error?.message,
    );

    const detail = await adminClient.rpc("admin_get_reservation", {
        p_id: seededRes.id,
        p_reason: "TEST-50 민원 확인",
    });
    check(
        "사유를 붙이면 상세 열람 가능",
        !detail.error && detail.data?.patient_name === "환자테스트",
        detail.error?.message,
    );

    // =============================================================
    section("6. 접속기록 (고시 제8조 ① · 제2조 3호)");
    // =============================================================
    const { data: logs } = await admin
        .from("access_logs")
        .select("action, subject_id, target_id, reason, actor_role")
        .eq("actor_id", adminId)
        .order("occurred_at", { ascending: false });

    const readLog = (logs ?? []).find((l) => l.action === "RESERVATION_READ");
    check("상세 열람이 접속기록에 남음", !!readLog);
    check(
        "접속기록에 처리한 정보주체가 기록됨",
        readLog?.subject_id === userId,
    );
    check(
        "접속기록에 열람 사유가 기록됨",
        readLog?.reason === "TEST-50 민원 확인",
    );
    check("접속기록에 취급자 역할이 기록됨", readLog?.actor_role === "ADMIN");
    check(
        "목록 조회도 접속기록에 남음",
        (logs ?? []).some((l) => l.action === "RESERVATION_LIST"),
    );
    check(
        "결제 사고 조회·상태 변경·고객 안내도 접속기록에 남음",
        [
            "PAYMENT_INCIDENT_LIST",
            "PAYMENT_INCIDENT_STATUS",
            "PAYMENT_INCIDENT_CONTACT",
        ].every((action) => (logs ?? []).some((l) => l.action === action)),
    );
    const contactLog = (logs ?? []).find(
        (l) => l.action === "PAYMENT_INCIDENT_CONTACT",
    );
    check(
        "고객 안내 내용은 접속기록에 중복 저장하지 않음",
        contactLog?.reason === "PHONE" &&
            !String(contactLog.reason).includes("TEST_PAYMENT_CONTACT_NOTE"),
        contactLog?.reason,
    );

    const ownLogs = await adminClient
        .from("access_logs")
        .select("id")
        .eq("actor_id", adminId);
    check(
        "관리자는 접속기록을 조회 가능",
        !ownLogs.error && (ownLogs.data ?? []).length > 0,
    );

    const forgeLog = await adminClient.from("access_logs").insert({
        actor_id: adminId,
        actor_role: "ADMIN",
        action: "FORGED",
    });
    check("접속기록을 직접 삽입할 수 없음", !!forgeLog.error);

    const delLog = await adminClient
        .from("access_logs")
        .delete()
        .eq("actor_id", adminId)
        .select("id");
    check(
        "접속기록을 지울 수 없음",
        !!delLog.error || (delLog.data ?? []).length === 0,
    );

    const directLog = await adminClient.rpc("log_access", {
        p_action: "FORGED",
    });
    check("log_access() 를 직접 호출할 수 없음", !!directLog.error);

    // =============================================================
    section("7. 비관리자는 관리자 기능에 닿지 못한다");
    // =============================================================
    for (const [name, args] of [
        ["admin_list_reservations", {}],
        ["admin_list_services", {}],
        ["admin_get_reservation", { p_id: seededRes.id, p_reason: "x" }],
        [
            "admin_get_payment_incident_reservation",
            { p_incident_id: incident.id },
        ],
        ["admin_payment_incident_summary", {}],
        ["admin_list_payment_incidents", { p_status: null }],
        [
            "admin_update_payment_incident",
            {
                p_id: seededRes.id,
                p_status: "ACKNOWLEDGED",
                p_memo: "권한 없는 상태 변경",
            },
        ],
        [
            "admin_record_payment_incident_contact",
            {
                p_id: seededRes.id,
                p_method: "PHONE",
                p_note: "권한 없는 고객 안내",
            },
        ],
        ["admin_grant_role", { p_target: userId }],
        ["admin_list_settlements", { p_limit: 10 }],
        ["admin_list_transfer_batches", { p_limit: 10 }],
        ["admin_list_batched_settlement_ids", {}],
        [
            "admin_issue_transfer_file",
            {
                p_batch_id: seededSvc.id,
                p_reason: "권한 없는 이체 파일 발급",
            },
        ],
        [
            "admin_create_transfer_batch",
            { p_ids: [seededSvc.id], p_reason: "권한 없는 이체 배치 생성" },
        ],
        [
            "admin_approve_settlements",
            { p_ids: [seededSvc.id], p_reason: "권한 없는 정산 승인" },
        ],
        [
            "admin_hold_settlements",
            { p_ids: [seededSvc.id], p_reason: "권한 없는 정산 보류" },
        ],
        [
            "admin_set_account_status",
            { p_target: userId, p_status: "SUSPENDED" },
        ],
        ["admin_list_service_notices", {}],
        [
            "admin_correct_service_time",
            {
                p_service_id: seededRes.id,
                p_field: "started_at",
                p_at: new Date().toISOString(),
                p_reason: "권한 없이 정정 시도",
            },
        ],
    ]) {
        const r = await userClient.rpc(name, args);
        check(`일반 사용자는 ${name}() 거절됨`, !!r.error);
    }

    const userLogs = await userClient.from("access_logs").select("id");
    check(
        "일반 사용자는 접속기록을 읽지 못함",
        !userLogs.error && (userLogs.data ?? []).length === 0,
    );

    const userAdminAcc = await userClient.from("admin_accounts").select("*");
    check(
        "일반 사용자는 admin_accounts 를 읽지 못함",
        !userAdminAcc.error && (userAdminAcc.data ?? []).length === 0,
    );

    // =============================================================
    section("8. 권한 부여·말소 내역 (고시 제5조 ③)");
    // =============================================================
    // 관리자는 전용 계정으로만 만든다. 쓰던 계정 승격은 막혀야 한다.
    const promoteCustomer = await adminClient.rpc("admin_grant_role", {
        p_target: userId,
        p_duty: "정산",
        p_reason: "TEST-50 고객 계정 승격 시도",
    });
    check(
        "이용 이력이 있는 고객 계정은 승격할 수 없음",
        !!promoteCustomer.error,
        "승격이 통과했다 — 개인 계정에 정산 권한이 붙는다",
    );

    const { data: stillUser } = await admin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
    check("승격 시도 후에도 고객 role 이 USER", stillUser.role === "USER");

    const promotePartner = await adminClient.rpc("admin_grant_role", {
        p_target: partnerId,
        p_reason: "TEST-50 파트너 승격 시도",
    });
    check("파트너 계정도 승격할 수 없음", !!promotePartner.error);

    // 전용 계정(이용 이력 없음)만 통과한다 — #56 의 계정 발급이 만들 형태
    const dedicated = await admin.auth.admin.createUser({
        email: DEDICATED_EMAIL,
        password: "dedicated50!",
        email_confirm: true,
        app_metadata: { must_change_password: true },
    });
    if (dedicated.error) throw dedicated.error;
    const dedicatedId = dedicated.data.user.id;
    await admin.from("profiles").upsert({
        id: dedicatedId,
        role: "USER",
        name: "신규관리자",
        email: DEDICATED_EMAIL,
        status: "ACTIVE",
    });

    await admin
        .from("admin_accounts")
        .update({ duty: "심사" })
        .eq("profile_id", adminId);
    const wrongDutyGrant = await adminClient.rpc("admin_grant_role", {
        p_target: dedicatedId,
        p_duty: "정산",
        p_reason: "TEST-56 계정 담당 외 발급 차단",
    });
    check(
        "계정 담당이 아닌 관리자는 관리자 계정 발급 불가",
        wrongDutyGrant.error?.code === "42501",
    );
    await admin
        .from("admin_accounts")
        .update({ duty: "계정" })
        .eq("profile_id", adminId);
    const [
        accountCanReview,
        accountCanSettle,
        accountCanAccount,
        accountCanAll,
    ] = await Promise.all([
        adminClient.rpc("can_issue_admin_duty", { p_duty: "심사" }),
        adminClient.rpc("can_issue_admin_duty", { p_duty: "정산" }),
        adminClient.rpc("can_issue_admin_duty", { p_duty: "계정" }),
        adminClient.rpc("can_issue_admin_duty", { p_duty: "전체" }),
    ]);
    check("계정 담당은 심사 duty 발급 가능", accountCanReview.data === true);
    check("계정 담당은 정산 duty 발급 가능", accountCanSettle.data === true);
    check("계정 담당은 계정 duty 발급 불가", accountCanAccount.data === false);
    check("계정 담당은 전체 duty 발급 불가", accountCanAll.data === false);
    await admin
        .from("admin_accounts")
        .update({ duty: "전체" })
        .eq("profile_id", adminId);
    const [allCanAccount, allCanAll] = await Promise.all([
        adminClient.rpc("can_issue_admin_duty", { p_duty: "계정" }),
        adminClient.rpc("can_issue_admin_duty", { p_duty: "전체" }),
    ]);
    check("전체 담당은 계정 duty 발급 가능", allCanAccount.data === true);
    check("전체 duty는 UI/RPC 발급 불가", allCanAll.data === false);
    await admin
        .from("admin_accounts")
        .update({ duty: "계정" })
        .eq("profile_id", adminId);
    const grant = await adminClient.rpc("admin_grant_role", {
        p_target: dedicatedId,
        p_duty: "정산",
        p_reason: "TEST-50 전용 계정 발급",
    });
    check(
        "이용 이력이 없는 전용 계정은 승격 가능",
        !grant.error,
        grant.error?.message,
    );

    const { data: granted } = await admin
        .from("profiles")
        .select("role")
        .eq("id", dedicatedId)
        .single();
    check("부여 후 role 이 ADMIN", granted.role === "ADMIN");

    const { data: dedicatedAuth } =
        await admin.auth.admin.getUserById(dedicatedId);
    check(
        "관리자 권한 부여 후에도 최초 비밀번호 변경 표식 유지",
        dedicatedAuth.user?.app_metadata.must_change_password === true,
    );

    const reissueApproval = await adminClient.rpc(
        "admin_authorize_password_reissue",
        {
            p_target: dedicatedId,
            p_reason: "TEST-56 전달 실패로 임시 비밀번호 재발급",
        },
    );
    check(
        "최초 비밀번호 변경 전에는 권한 범위 내 재발급 승인",
        !reissueApproval.error,
        reissueApproval.error?.message,
    );
    await admin.auth.admin.updateUserById(dedicatedId, {
        app_metadata: {
            ...dedicatedAuth.user?.app_metadata,
            must_change_password: false,
        },
    });
    const reissueAfterChange = await adminClient.rpc(
        "admin_authorize_password_reissue",
        {
            p_target: dedicatedId,
            p_reason: "TEST-56 변경 완료 계정 재발급 차단",
        },
    );
    check(
        "최초 비밀번호 변경 완료 후에는 재발급 불가",
        reissueAfterChange.error?.code === "23514",
    );

    const { data: grantRows } = await admin
        .from("admin_role_grants")
        .select("action, actor_id, reason")
        .eq("target_id", dedicatedId);
    check(
        "권한 부여 내역이 기록됨 (부여자 포함)",
        (grantRows ?? []).some(
            (g) => g.action === "GRANT" && g.actor_id === adminId,
        ),
    );

    const revoke = await adminClient.rpc("admin_revoke_role", {
        p_target: dedicatedId,
        p_reason: "TEST-50 원복",
    });
    check("관리자 권한 말소 가능", !revoke.error, revoke.error?.message);

    const { data: revoked } = await admin
        .from("profiles")
        .select("role")
        .eq("id", dedicatedId)
        .single();
    check("말소 후 role 이 USER 로 복귀", revoked.role === "USER");

    // 이 검사는 "활성 관리자가 나 혼자"일 때만 의미가 있다.
    // 로컬에 seed:admin 계정 등이 남아 있을 수 있으므로 잠시 재워두고 확인한다.
    const { data: others } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "ADMIN")
        .eq("status", "ACTIVE")
        .neq("id", adminId);
    const otherIds = (others ?? []).map((o) => o.id);
    if (otherIds.length) {
        await admin
            .from("profiles")
            .update({ status: "SUSPENDED" })
            .in("id", otherIds);
    }

    const lastAdmin = await adminClient.rpc("admin_revoke_role", {
        p_target: adminId,
        p_reason: "TEST-50 마지막 관리자",
    });
    check(
        `마지막 관리자는 스스로를 말소할 수 없음 (다른 관리자 ${otherIds.length}명 일시 정지)`,
        !!lastAdmin.error,
        "말소가 통과했다 — 복구 불가 상태가 된다",
    );

    if (otherIds.length) {
        await admin
            .from("profiles")
            .update({ status: "ACTIVE" })
            .in("id", otherIds);
    }

    // =============================================================
    section("9. 현장 고지·오류 처리 (매뉴얼 대응카드 13 · 26)");
    // =============================================================
    //  파트너는 신고만 하고 판단은 운영센터가 한다. 시각 정정도 관리자만
    //  할 수 있고 사유가 access_logs 에 남는다 — #50 과 같은 형태다.
    // 앞 섹션이 이미 이 예약의 서비스를 만들었을 수 있다(reservation_id 유일).
    const { data: existingSvc } = await admin
        .from("services")
        .select("id")
        .eq("reservation_id", seededRes.id)
        .maybeSingle();

    let noticeSvc = existingSvc;
    if (!noticeSvc) {
        const { data: created, error: createErr } = await admin
            .from("services")
            .insert({
                reservation_id: seededRes.id,
                partner_id: partnerId,
                status: "IN_PROGRESS",
            })
            .select("id")
            .single();
        if (createErr) throw createErr;
        noticeSvc = created;
    }
    await admin
        .from("services")
        .update({
            partner_id: partnerId,
            started_at: new Date(Date.now() - 3_600_000).toISOString(),
        })
        .eq("id", noticeSvc.id);

    const { data: noticeId, error: noticeIdErr } = await admin
        .from("service_notices")
        .insert({
            service_id: noticeSvc.id,
            partner_id: partnerId,
            kind: "BUTTON_ERROR",
            occurred_at: new Date(Date.now() - 3_500_000).toISOString(),
            error_text: "처리에 실패했습니다",
            detail: "지하 1층, 데이터 끊김",
        })
        .select("id")
        .single();
    if (noticeIdErr) throw noticeIdErr;

    const listed = await adminClient.rpc("admin_list_service_notices", {
        p_only_open: true,
    });
    check(
        "관리자는 처리 대기 신고를 볼 수 있다",
        !listed.error && (listed.data ?? []).some((n) => n.id === noticeId.id),
        listed.error?.message,
    );

    const noMemo = await adminClient.rpc("admin_resolve_service_notice", {
        p_id: noticeId.id,
        p_memo: "확인",
    });
    check(
        "운영센터 안내 없이는 닫을 수 없다 (대응카드 26 종료 기준)",
        !!noMemo.error,
        "짧은 메모로 닫혔다",
    );

    const resolved = await adminClient.rpc("admin_resolve_service_notice", {
        p_id: noticeId.id,
        p_memo: "실제 시각으로 시작시각을 정정했습니다.",
    });
    check(
        "안내를 남기면 닫힌다",
        resolved.data === true,
        resolved.error?.message,
    );

    // ---------- 시각 정정 ----------
    const shortReason = await adminClient.rpc("admin_correct_service_time", {
        p_service_id: noticeSvc.id,
        p_field: "started_at",
        p_at: new Date(Date.now() - 3_500_000).toISOString(),
        p_reason: "오타",
    });
    check("사유가 짧으면 정정이 거절된다", !!shortReason.error);

    const badField = await adminClient.rpc("admin_correct_service_time", {
        p_service_id: noticeSvc.id,
        p_field: "partner_id",
        p_at: new Date().toISOString(),
        p_reason: "화이트리스트 밖 컬럼을 노린다",
    });
    check("화이트리스트 밖 컬럼은 고칠 수 없다", !!badField.error);

    const future = await adminClient.rpc("admin_correct_service_time", {
        p_service_id: noticeSvc.id,
        p_field: "started_at",
        p_at: new Date(Date.now() + 3_600_000).toISOString(),
        p_reason: "아직 오지 않은 시각으로 바꿔본다",
    });
    check("미래 시각으로는 고칠 수 없다", !!future.error);

    const corrected = new Date(Date.now() - 3_400_000).toISOString();
    const fix = await adminClient.rpc("admin_correct_service_time", {
        p_service_id: noticeSvc.id,
        p_field: "started_at",
        p_at: corrected,
        p_reason: "버튼 오류 신고에 따라 실제 시각으로 정정",
    });
    check(
        "사유를 남기면 시각이 정정된다",
        !fix.error && fix.data?.field === "started_at",
        fix.error?.message,
    );

    const { data: fixedSvc } = await admin
        .from("services")
        .select("started_at")
        .eq("id", noticeSvc.id)
        .maybeSingle();
    check(
        "정정한 값이 실제로 들어간다",
        new Date(fixedSvc.started_at).getTime() ===
            new Date(corrected).getTime(),
        fixedSvc?.started_at,
    );

    const { data: fixLogs } = await admin
        .from("access_logs")
        .select("action, target_table, reason")
        .eq("actor_id", adminId)
        .eq("target_table", "services");
    check(
        "정정 사실이 접속기록에 남는다 (바꾸기 전 값 포함)",
        (fixLogs ?? []).some(
            (l) =>
                l.action === "UPDATE" &&
                (l.reason ?? "").includes("started_at") &&
                (l.reason ?? "").includes("→"),
        ),
        JSON.stringify(fixLogs),
    );

    // =============================================================
    section("10. 자격 심사 담당 권한·사유·중복 처리 (#56)");
    const qualification = await admin
        .from("partner_qualifications")
        .insert({
            partner_id: partnerId,
            type: "TEST-56",
            path: `${partnerId}/test-56.pdf`,
            filename: "test-56.pdf",
            size: 1,
        })
        .select("id")
        .single();
    if (qualification.error) throw qualification.error;
    const qualificationId = qualification.data.id;
    const proofPath = `${partnerId}/test-56.pdf`;
    const proofUpload = await admin.storage
        .from("partner-qualifications")
        .upload(proofPath, Buffer.from("%PDF-1.4\nTEST-56\n%%EOF"), {
            contentType: "application/pdf",
            upsert: true,
        });
    if (proofUpload.error) throw proofUpload.error;
    const reviewArgs = {
        p_id: qualificationId,
        p_expected: "PENDING",
        p_status: "VERIFIED",
        p_reason: "TEST-56 증빙 확인 완료",
    };
    await admin
        .from("admin_accounts")
        .upsert({ profile_id: adminId, duty: "정산" });
    const wrongDuty = await adminClient.rpc(
        "admin_review_qualification",
        reviewArgs,
    );
    check("정산 담당은 자격 심사 불가", wrongDuty.error?.code === "42501");
    const oldBypass = await adminClient.rpc("admin_verify_qualification", {
        p_id: qualificationId,
        p_status: "VERIFIED",
        p_reason: reviewArgs.p_reason,
    });
    check(
        "구 심사 RPC도 담당업무 우회 불가",
        oldBypass.error?.code === "42501",
    );
    const userReview = await userClient.rpc(
        "admin_review_qualification",
        reviewArgs,
    );
    check("일반 사용자는 자격 심사 불가", userReview.error?.code === "42501");
    await admin
        .from("admin_accounts")
        .update({ duty: "심사" })
        .eq("profile_id", adminId);
    const noFileLog = await adminClient.rpc("can_read_qualification_file", {
        p_path: proofPath,
    });
    const unsignedProof = await adminClient.storage
        .from("partner-qualifications")
        .createSignedUrl(proofPath, 300);
    check("열람 기록 없이 서명 URL 발급 불가", Boolean(unsignedProof.error));
    check("열람 기록 없이 증빙 접근 불가", noFileLog.data === false);
    const shortFileReason = await adminClient.rpc(
        "admin_get_qualification_file",
        { p_id: qualificationId, p_reason: " " },
    );
    check("증빙 사유 필수", shortFileReason.error?.code === "22023");
    const fileRead = await adminClient.rpc("admin_get_qualification_file", {
        p_id: qualificationId,
        p_reason: "TEST-56 증빙 원문 확인",
    });
    check(
        "심사 담당이 사유를 남기면 파일 경로 반환",
        fileRead.data === `${partnerId}/test-56.pdf`,
        fileRead.error?.message,
    );
    const loggedFile = await adminClient.rpc("can_read_qualification_file", {
        p_path: proofPath,
    });
    const signedProof = await adminClient.storage
        .from("partner-qualifications")
        .createSignedUrl(proofPath, 300);
    check(
        "열람 기록 직후 서명 URL 발급 성공",
        Boolean(signedProof.data?.signedUrl) && !signedProof.error,
        signedProof.error?.message,
    );
    check("열람 기록이 있는 파일만 접근 가능", loggedFile.data === true);
    const otherFile = await adminClient.rpc("can_read_qualification_file", {
        p_path: `${partnerId}/other.pdf`,
    });
    check("다른 파일에는 열람 허가가 전파되지 않음", otherFile.data === false);
    const badReason = await adminClient.rpc("admin_review_qualification", {
        ...reviewArgs,
        p_reason: " ",
    });
    check("심사 사유 필수", badReason.error?.code === "22023");
    const accepted = await adminClient.rpc(
        "admin_review_qualification",
        reviewArgs,
    );
    check("심사 담당 인증 완료 성공", !accepted.error, accepted.error?.message);
    const duplicateReview = await adminClient.rpc(
        "admin_review_qualification",
        reviewArgs,
    );
    check(
        "중복·오래된 상태로 심사 시 거부",
        duplicateReview.error?.code === "P0002",
    );
    const verified = await admin
        .from("partner_qualifications")
        .select("status")
        .eq("id", qualificationId)
        .single();
    check("심사 결과 실제 저장", verified.data?.status === "VERIFIED");
    const verifiedNotice = await admin
        .from("notifications")
        .select("type, title, body, link")
        .eq("recipient_id", partnerId)
        .eq("type", "QUALIFICATION_VERIFIED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    check(
        "인증 완료 사유를 파트너에게 알림",
        verifiedNotice.data?.body?.includes(reviewArgs.p_reason) &&
            verifiedNotice.data?.link === "/partner/profile",
        verifiedNotice.error?.message,
    );
    const revisionReason = "TEST-56 증빙 보완 후 다시 제출해 주세요";
    const revision = await adminClient.rpc("admin_review_qualification", {
        p_id: qualificationId,
        p_expected: "VERIFIED",
        p_status: "PENDING",
        p_reason: revisionReason,
    });
    check("심사 대기 전환 성공", !revision.error, revision.error?.message);
    const revisionNotice = await admin
        .from("notifications")
        .select("body, link")
        .eq("recipient_id", partnerId)
        .eq("type", "QUALIFICATION_REVIEW_REQUIRED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    check(
        "수정 요청 사유를 파트너에게 알림",
        revisionNotice.data?.body?.includes(revisionReason) &&
            revisionNotice.data?.link === "/partner/profile",
        revisionNotice.error?.message,
    );
    const reviewLogs = await admin
        .from("access_logs")
        .select("action, subject_id")
        .eq("target_id", qualificationId);
    check(
        "증빙 열람과 심사 기록에 파트너 식별자 포함",
        ["QUALIFICATION_FILE_READ", "QUALIFICATION_REVIEW"].every((action) =>
            reviewLogs.data?.some(
                (log) => log.action === action && log.subject_id === partnerId,
            ),
        ),
    );
    await admin
        .from("partner_qualifications")
        .delete()
        .eq("id", qualificationId);
    const proofRemoval = await admin.storage
        .from("partner-qualifications")
        .remove([proofPath]);
    if (proofRemoval.error) throw proofRemoval.error;
    await admin
        .from("notifications")
        .delete()
        .eq("recipient_id", partnerId)
        .in("type", [
            "QUALIFICATION_VERIFIED",
            "QUALIFICATION_REVIEW_REQUIRED",
        ]);

    section("11. 정지된 관리자는 즉시 차단된다");
    // =============================================================
    await admin
        .from("profiles")
        .update({ status: "SUSPENDED" })
        .eq("id", adminId);

    const suspendedLive = await adminClient.rpc("is_admin_live");
    const suspendedReview = await adminClient.rpc("can_review_qualifications");
    check("정지된 심사 담당 권한 즉시 해제", suspendedReview.data === false);
    check(
        "정지 즉시 is_admin_live() = false (JWT 갱신 전에도)",
        suspendedLive.data === false,
    );

    const suspendedWrite = await adminClient.rpc("admin_set_account_status", {
        p_target: userId,
        p_status: "ACTIVE",
    });
    check("정지된 관리자는 쓰기 RPC 거절됨", !!suspendedWrite.error);

    await admin.from("profiles").update({ status: "ACTIVE" }).eq("id", adminId);

    // ---------------------------------------------------------------
    // 정리
    // ---------------------------------------------------------------
    if (seededCare) {
        await admin.from("care_recipients").delete().eq("id", seededCare.id);
    }
    await cleanup(adminId);
    await admin.auth.admin.deleteUser(adminId);

    const { data: leftovers } = await admin
        .from("reservations")
        .select("id")
        .like("code", `${CODE_PREFIX}%`);
    console.log(`\n정리 — TEST 예약 잔여 | ${(leftovers ?? []).length}`);

    console.log(`\n\x1b[1m${passed}건 통과 / ${failed}건 실패\x1b[0m`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("\n❌ 오류:", e.message ?? e);
    process.exit(1);
});

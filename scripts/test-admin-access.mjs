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
    await admin.from("reservations").delete().like("code", `${CODE_PREFIX}%`);
    if (adminId) {
        await admin.from("access_logs").delete().eq("actor_id", adminId);
        await admin.from("admin_role_grants").delete().eq("target_id", adminId);
        await admin.from("admin_accounts").delete().eq("profile_id", adminId);
    }
    // 승격 테스트용 전용 계정 — profiles/admin_* 는 cascade 로 함께 지워진다
    const dedicated = await findUserByEmail(DEDICATED_EMAIL);
    if (dedicated) await admin.auth.admin.deleteUser(dedicated.id);
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

    await upgradeToAal2(adminClient);

    const aal2IsAdmin = await adminClient.rpc("is_admin");
    check("2단계 인증 후 is_admin() = true", aal2IsAdmin.data === true);

    const aal2Live = await adminClient.rpc("is_admin_live");
    check("2단계 인증 후 is_admin_live() = true", aal2Live.data === true);

    // =============================================================
    section("3. 관리자가 볼 수 없어야 하는 것 (처리방침 제10조 3)");
    // =============================================================

    // 확인용 데이터를 서비스 롤로 심는다
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
        "관리자는 services 를 읽지 못함 (수행 메모 보호)",
        !svcRead.error && (svcRead.data ?? []).length === 0,
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

    const noReason = await adminClient.rpc("admin_get_reservation", {
        p_id: seededRes.id,
        p_reason: "   ",
    });
    check("사유 없는 상세 열람은 거절됨", !!noReason.error);

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
    check("접속기록에 열람 사유가 기록됨", readLog?.reason === "TEST-50 민원 확인");
    check(
        "접속기록에 취급자 역할이 기록됨",
        readLog?.actor_role === "ADMIN",
    );
    check(
        "목록 조회도 접속기록에 남음",
        (logs ?? []).some((l) => l.action === "RESERVATION_LIST"),
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
        ["admin_get_reservation", { p_id: seededRes.id, p_reason: "x" }],
        ["admin_grant_role", { p_target: userId }],
        ["admin_set_account_status", { p_target: userId, p_status: "SUSPENDED" }],
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

    const partnerProfile = await admin
        .from("partner_accounts")
        .select("profile_id")
        .limit(1)
        .maybeSingle();
    if (partnerProfile.data) {
        const promotePartner = await adminClient.rpc("admin_grant_role", {
            p_target: partnerProfile.data.profile_id,
            p_reason: "TEST-50 파트너 승격 시도",
        });
        check("파트너 계정도 승격할 수 없음", !!promotePartner.error);
    }

    // 전용 계정(이용 이력 없음)만 통과한다 — #56 의 계정 발급이 만들 형태
    const dedicated = await admin.auth.admin.createUser({
        email: DEDICATED_EMAIL,
        password: "dedicated50!",
        email_confirm: true,
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
    section("9. 정지된 관리자는 즉시 차단된다");
    // =============================================================
    await admin.from("profiles").update({ status: "SUSPENDED" }).eq("id", adminId);

    const suspendedLive = await adminClient.rpc("is_admin_live");
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

    console.log(
        `\n\x1b[1m${passed}건 통과 / ${failed}건 실패\x1b[0m`,
    );
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("\n❌ 오류:", e.message ?? e);
    process.exit(1);
});

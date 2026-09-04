// 파트너 개인정보 접근 3단계 재현 테스트 (#66 · #67) — 로컬 전용.
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/test-partner-access.mjs
//
// 사전 조건:
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) `npm run seed:dev` 로 일반 사용자·파트너 계정이 있을 것
//
// 안전장치: NEXT_PUBLIC_SUPABASE_URL 이 localhost/127.0.0.1 이 아니면 즉시 중단한다.
//
// 무엇을 검증하는가:
//   개인정보처리방침(시행일 2026-09-03)이 파트너 제공 범위를 3단계로 공개하고 있다.
//     단계 1  매칭 전   — 제5조 ② 단계 1 · 제5조 ③④
//     단계 2  확정 후   — 제5조 ② 단계 2 · 제9조 ②  (CONFIRMED 기준)
//     차단    제출 완료 / 종료 후 24시간 — 제9조 ④
//   "무엇이 보이는가" 보다 "무엇이 안 보이는가" 를 실제 로그인 세션으로 확인한다.
//
// 멱등: code 가 TEST-66 으로 시작하는 예약과 전용 테스트 파트너만 지운다.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
    console.error("❌ SUPABASE URL / ANON_KEY / SERVICE_ROLE_KEY 가 필요합니다.");
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

/** 두 번째 파트너 — "남의 확정 건은 못 본다" 를 확인하려면 두 명이 필요하다 */
const OTHER_LOGIN_ID = "tpart66";
const OTHER_EMAIL = `${OTHER_LOGIN_ID}@partner.hamkegayo.internal`;
const OTHER_PASSWORD = "tpart66pw!";

const CODE_PREFIX = "TEST-66";

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
function section(t) {
    console.log(`\n\x1b[1m${t}\x1b[0m`);
}

async function signIn(email, password) {
    const c = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`${email} 로그인 실패: ${error.message}`);
    return c;
}

async function findUserByEmail(email) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    return data.users.find((u) => u.email === email) ?? null;
}

async function cleanup() {
    await admin.from("reservations").delete().like("code", `${CODE_PREFIX}%`);
    const other = await findUserByEmail(OTHER_EMAIL);
    if (other) await admin.auth.admin.deleteUser(other.id);
}

/** 두 번째 파트너 계정을 만든다 */
async function makeOtherPartner() {
    const { data, error } = await admin.auth.admin.createUser({
        email: OTHER_EMAIL,
        password: OTHER_PASSWORD,
        email_confirm: true,
    });
    if (error) throw error;
    const id = data.user.id;
    await admin.from("profiles").upsert({
        id,
        role: "PARTNER",
        name: "두번째파트너",
        email: OTHER_EMAIL,
        status: "ACTIVE",
    });
    await admin
        .from("partner_accounts")
        .upsert({ profile_id: id, login_id: OTHER_LOGIN_ID });
    return id;
}

/** 개인정보가 담긴 예약 1건을 심는다 */
async function seedReservation(customerId, code, extra = {}) {
    const { data, error } = await admin
        .from("reservations")
        .insert({
            code,
            customer_id: customerId,
            plan: "basic",
            patient_name: "환자실명",
            patient_birth: "1948-05-11",
            patient_gender: "female",
            patient_phone: "01055556666",
            guardian_name: "보호자실명",
            guardian_phone: "01077778888",
            relation: "자녀",
            treatment: "정형외과",
            purpose: "무릎 통증 검사",
            cautions: "계단 이용 불가",
            other_requests: "천천히 이동 부탁드립니다",
            use_date: "2026-12-15",
            arrive_time: "09:00",
            reserve_time: "10:00",
            duration: "2시간",
            duration_minutes: 120,
            depart_address: "서울특별시 강남구 역삼동 123-45",
            hospital_address: "서울특별시 서초구 반포대로 58",
            hospital_name: "테스트정형외과",
            mobility_status: "부축 필요",
            cognitive_status: "의사소통 원활",
            ...extra,
        })
        .select("id")
        .single();
    if (error) throw error;
    return data.id;
}

async function main() {
    console.log("\x1b[1m#66 · #67 파트너 개인정보 접근 3단계 검증\x1b[0m");
    await cleanup();

    const userClient = await signIn(USER_EMAIL, USER_PASSWORD);
    const {
        data: { user: customer },
    } = await userClient.auth.getUser();

    const partnerClient = await signIn(partnerEmail, PARTNER_PASSWORD);
    const {
        data: { user: partner },
    } = await partnerClient.auth.getUser();

    const otherId = await makeOtherPartner();
    const otherClient = await signIn(OTHER_EMAIL, OTHER_PASSWORD);

    const openId = await seedReservation(customer.id, `${CODE_PREFIX}-OPEN`);

    // =============================================================
    section("1. 단계 1 — 매칭 전에는 직접 조회가 막힌다 (제5조 ③)");
    // =============================================================
    const direct = await partnerClient
        .from("reservations")
        .select("*")
        .eq("id", openId);
    check(
        "파트너는 MATCHING 예약을 직접 읽지 못함",
        !direct.error && (direct.data ?? []).length === 0,
        `${(direct.data ?? []).length}건 보임`,
    );

    const list = await partnerClient.rpc("partner_list_open_reservations", {
        p_limit: 100,
    });
    const row = (list.data ?? []).find((r) => r.id === openId);
    check(
        "partner_list_open_reservations() 로는 보임",
        !list.error && !!row,
        list.error?.message,
    );

    // ⚠️ 회귀 방지 — 수락·거절 액션이 예약 상태를 확인하는 경로.
    //    직접 조회가 막혔으므로(위 검증) 상태 판정은 partner_in_review() 로만 가능하다.
    //    이걸 놓치면 파트너가 요청을 아예 수락할 수 없게 된다.
    const review = await partnerClient.rpc("partner_in_review", {
        res_id: openId,
    });
    check(
        "partner_in_review() 가 검토 단계로 판정함 (수락 액션의 전제)",
        !review.error && review.data === true,
        review.error?.message ?? `data=${review.data}`,
    );

    // =============================================================
    section("2. 단계 1 반환 항목 — 방침 제5조 ② 단계 1 목록과 일치하는가");
    // =============================================================
    const banned = [
        "patient_name",
        "patient_phone",
        "patient_birth",
        "guardian_name",
        "guardian_phone",
        "treatment",
        "purpose",
        "cautions",
        "other_requests",
        "depart_address",
        "hospital_address",
        "prepaid_amount",
    ].filter((k) => k in (row ?? {}));
    check(
        "실명·연락처·상세주소·진료내용·목적·요청사항·결제액이 없음",
        banned.length === 0,
        `노출된 컬럼: ${banned.join(", ")}`,
    );

    check(
        `병원명이 제공됨 (${row?.hospital_name})`,
        row?.hospital_name === "테스트정형외과",
    );
    check(
        `출발지가 동 단위로 축약됨 (${row?.depart_region})`,
        row?.depart_region === "서울특별시 강남구 역삼동",
    );
    check(
        `병원 주소도 지역만 (${row?.hospital_region})`,
        row?.hospital_region === "서울특별시 서초구" &&
            !String(row?.hospital_region).includes("반포대로"),
    );
    check(
        "거동·인지 상태는 제공됨 (제5조 ④)",
        row?.mobility_status === "부축 필요" &&
            row?.cognitive_status === "의사소통 원활",
    );

    // =============================================================
    section("3. 단계 2 — 기준은 ACCEPTED 가 아니라 CONFIRMED (제9조 ②)");
    // =============================================================
    await admin.from("reservation_applications").insert({
        reservation_id: openId,
        partner_id: partner.id,
        status: "ACCEPTED",
    });

    const afterAccept = await partnerClient
        .from("reservations")
        .select("patient_name")
        .eq("id", openId);
    check(
        "수락만 해서는 상세를 볼 수 없음",
        !afterAccept.error && (afterAccept.data ?? []).length === 0,
        `${(afterAccept.data ?? []).length}건 보임`,
    );

    // 고객이 이 파트너를 선택하고 선결제까지 마친 상태
    await admin
        .from("reservations")
        .update({ status: "CONFIRMED", confirmed_partner_id: partner.id })
        .eq("id", openId);

    const afterConfirm = await partnerClient
        .from("reservations")
        .select("patient_name, patient_phone, depart_address")
        .eq("id", openId)
        .maybeSingle();
    check(
        "확정 후에는 수행에 필요한 전체 정보가 열림",
        !afterConfirm.error && afterConfirm.data?.patient_name === "환자실명",
        afterConfirm.error?.message,
    );

    const otherView = await otherClient
        .from("reservations")
        .select("id")
        .eq("id", openId);
    check(
        "선택되지 않은 다른 파트너는 확정 건을 볼 수 없음",
        !otherView.error && (otherView.data ?? []).length === 0,
    );

    // =============================================================
    section("4. 차단 — 수행기록 제출 완료 / 종료 후 24시간 (제9조 ④)");
    // =============================================================
    // CONFIRMED 전이 시 create_service_on_confirm 트리거가 services 행을 이미 만든다.
    const { data: svc, error: svcErr } = await admin
        .from("services")
        .update({
            status: "ENDED",
            started_at: "2026-12-15T01:00:00Z",
            ended_at: new Date().toISOString(),
        })
        .eq("reservation_id", openId)
        .select("id")
        .single();
    if (svcErr) throw svcErr;

    const beforeSubmit = await partnerClient
        .from("reservations")
        .select("id")
        .eq("id", openId);
    check(
        "종료 직후·리포트 작성 전에는 아직 열려 있음",
        !beforeSubmit.error && (beforeSubmit.data ?? []).length === 1,
    );

    const { data: rep } = await admin
        .from("reports")
        .insert({
            service_id: svc.id,
            partner_id: partner.id,
            status: "DRAFT",
        })
        .select("id")
        .single();

    const draftOpen = await partnerClient
        .from("reservations")
        .select("id")
        .eq("id", openId);
    check(
        "리포트 작성 중(DRAFT)에는 계속 열려 있음",
        !draftOpen.error && (draftOpen.data ?? []).length === 1,
    );

    await admin
        .from("reports")
        .update({ status: "SUBMITTED", submitted_at: new Date().toISOString() })
        .eq("id", rep.id);

    const afterSubmit = await partnerClient
        .from("reservations")
        .select("id")
        .eq("id", openId);
    check(
        "수행기록 제출 완료 시 예약 접근이 차단됨",
        !afterSubmit.error && (afterSubmit.data ?? []).length === 0,
        `${(afterSubmit.data ?? []).length}건 보임`,
    );

    const svcAfter = await partnerClient
        .from("services")
        .select("id")
        .eq("id", svc.id);
    check(
        "서비스 수행 기록도 함께 차단됨",
        !svcAfter.error && (svcAfter.data ?? []).length === 0,
    );

    const repAfter = await partnerClient
        .from("reports")
        .select("id")
        .eq("id", rep.id);
    check(
        "제출한 리포트도 다시 볼 수 없음",
        !repAfter.error && (repAfter.data ?? []).length === 0,
    );

    // 종료 후 24시간 경과 — 리포트를 되돌려도 시간으로 차단된다
    await admin.from("reports").update({ status: "DRAFT" }).eq("id", rep.id);
    await admin
        .from("services")
        .update({
            ended_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
        })
        .eq("id", svc.id);

    const after24h = await partnerClient
        .from("reservations")
        .select("id")
        .eq("id", openId);
    check(
        "리포트 미제출이어도 종료 후 24시간이 지나면 차단됨",
        !after24h.error && (after24h.data ?? []).length === 0,
    );

    // =============================================================
    section("5. 차단 후에도 정산 이력은 남는다 (#67)");
    // =============================================================
    await admin.from("services").update({ status: "COMPLETED" }).eq("id", svc.id);
    const { data: settlement } = await admin
        .from("settlements")
        .select("id")
        .eq("service_id", svc.id)
        .maybeSingle();

    const settleDirect = await partnerClient
        .from("settlements")
        .select("id, services!inner(reservations!inner(patient_name))")
        .eq("partner_id", partner.id);
    check(
        "예약 조인을 타는 정산 조회는 비어버림 (RPC 가 필요한 이유)",
        !settleDirect.error && (settleDirect.data ?? []).length === 0,
    );

    const settleRpc = await partnerClient.rpc("partner_list_settlements");
    const settleRow = (settleRpc.data ?? []).find(
        (s) => s.id === settlement?.id,
    );
    check(
        "partner_list_settlements() 로는 정산 이력이 보임",
        !settleRpc.error && !!settleRow,
        settleRpc.error?.message,
    );
    const settleLeaked = ["patient_name", "hospital_address", "treatment"].filter(
        (k) => k in (settleRow ?? {}),
    );
    check(
        "정산 이력에 이용자 개인정보가 없음 (예약번호·일자·금액만)",
        settleLeaked.length === 0 && !!settleRow?.code,
        `노출: ${settleLeaked.join(", ")}`,
    );

    // =============================================================
    section("6. 거절한 파트너는 즉시 차단된다 (제9조 ④)");
    // =============================================================
    const rejectId = await seedReservation(customer.id, `${CODE_PREFIX}-REJ`);

    const beforeReject = await otherClient.rpc(
        "partner_list_open_reservations",
        { p_limit: 100 },
    );
    check(
        "거절 전에는 목록에 있음",
        (beforeReject.data ?? []).some((r) => r.id === rejectId),
    );

    await admin.from("reservation_applications").insert({
        reservation_id: rejectId,
        partner_id: otherId,
        status: "REJECTED",
    });

    const afterReject = await otherClient.rpc(
        "partner_list_open_reservations",
        { p_limit: 100 },
    );
    check(
        "거절 후 목록에서 사라짐",
        !(afterReject.data ?? []).some((r) => r.id === rejectId),
    );

    const rejectDetail = await otherClient.rpc("partner_get_open_reservation", {
        p_id: rejectId,
    });
    check("거절한 파트너는 상세 RPC 도 거절됨", !!rejectDetail.error);

    const rejectReview = await otherClient.rpc("partner_in_review", {
        res_id: rejectId,
    });
    check(
        "거절한 파트너에게는 검토 단계가 아님 (재수락 차단)",
        !rejectReview.error && rejectReview.data === false,
        `data=${rejectReview.data}`,
    );

    // =============================================================
    section("7. 파트너가 아니면 접근할 수 없다");
    // =============================================================
    for (const [name, args] of [
        ["partner_list_open_reservations", { p_limit: 10 }],
        ["partner_get_open_reservation", { p_id: rejectId }],
        ["partner_list_settlements", {}],
    ]) {
        const r = await userClient.rpc(name, args);
        check(`일반 사용자는 ${name}() 거절됨`, !!r.error);
    }

    // ---------------------------------------------------------------
    await cleanup();
    const { data: left } = await admin
        .from("reservations")
        .select("id")
        .like("code", `${CODE_PREFIX}%`);
    console.log(`\n정리 — TEST 예약 잔여 | ${(left ?? []).length}`);
    console.log(`\n\x1b[1m${passed}건 통과 / ${failed}건 실패\x1b[0m`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("\n❌ 오류:", e.message ?? e);
    process.exit(1);
});

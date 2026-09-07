// 서비스 수행 시각 기록 검증 (#55) — 로컬 전용.
//
// 실행:
//   1) npx supabase start && npx supabase db reset
//   2) npm run seed:dev
//   3) npm run test:service
//
// 무엇을 지키려는 테스트인가
//   매뉴얼은 "임의의 시각을 입력하지 않는다" 고 반복해서 규정한다(4·13단계·
//   대응카드 26). 시각이 사람 손을 타면 약관 제12조 ④ 의 분쟁 증빙이 무너진다.
//   그래서 **서버가 찍은 시각만** 남는지, 누를 수 없는 때 눌리지 않는지를 본다.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
    console.error("❌ SUPABASE URL / SERVICE_ROLE / ANON 키가 필요합니다.");
    process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error("❌ 로컬 스택이 아닙니다. 중단합니다.");
    process.exit(1);
}

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const CODE_PREFIX = "TEST-55";
const PARTNER_LOGIN = process.env.PARTNER_LOGIN_ID ?? "tpart01";
const PARTNER_EMAIL = `${PARTNER_LOGIN}@partner.hamkegayo.internal`;
const PARTNER_PASSWORD = process.env.PARTNER_PASSWORD ?? "tpart1234!";
const CUSTOMER_EMAIL = process.env.USER_EMAIL ?? "user01@example.com";

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

function section(title) {
    console.log(`\n▶ ${title}`);
}

async function signIn(email, password) {
    const c = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`${email} 로그인 실패: ${error.message}`);
    return c;
}

async function findProfile(email) {
    const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
    if (!data)
        throw new Error(
            `${email} 프로필이 없습니다. seed:dev 를 먼저 실행하세요.`,
        );
    return data.id;
}

/** 확정 예약 + 서비스 1건. arriveTime 은 "HH:MM". */
async function makeService(customerId, partnerId, suffix, useDate, arriveTime) {
    const { data: res, error } = await admin
        .from("reservations")
        .insert({
            code: `${CODE_PREFIX}-${suffix}`,
            customer_id: customerId,
            confirmed_partner_id: partnerId,
            status: "CONFIRMED",
            plan: "basic",
            patient_name: "홍길동",
            patient_birth: "1950-01-01",
            patient_gender: "male",
            patient_phone: "01011112222",
            guardian_name: "김보호",
            guardian_phone: "01022223333",
            relation: "자녀",
            treatment: "내과",
            purpose: "정기진료",
            use_date: useDate,
            arrive_time: arriveTime,
            reserve_time: arriveTime,
            duration: "2시간",
            duration_minutes: 120,
            depart_address: "서울시 어딘가",
            hospital_address: "서울시 병원",
            hospital_name: "테스트병원",
        })
        .select("id")
        .single();
    if (error) throw error;

    const { data: svc, error: sErr } = await admin
        .from("services")
        .insert({
            reservation_id: res.id,
            partner_id: partnerId,
            status: "SCHEDULED",
        })
        .select("id")
        .single();
    if (sErr) throw sErr;
    return { reservationId: res.id, serviceId: svc.id, partnerId };
}

async function cleanup() {
    await admin.from("reservations").delete().like("code", `${CODE_PREFIX}%`);
}

/** 오늘 날짜(KST) — 예약시각 비교가 KST 기준이라 맞춰 만든다 */
function todayKst() {
    const now = new Date(Date.now() + 9 * 3600_000);
    return now.toISOString().slice(0, 10);
}

async function main() {
    console.log("\n[1m#55 서비스 수행 시각 기록 검증[0m");
    await cleanup();

    const customerId = await findProfile(CUSTOMER_EMAIL);
    const partnerId = await findProfile(PARTNER_EMAIL);
    const partner = await signIn(PARTNER_EMAIL, PARTNER_PASSWORD);
    const user = await signIn(
        CUSTOMER_EMAIL,
        process.env.USER_PASSWORD ?? "user1234!",
    );

    // =============================================================
    section("시작 버튼 — 예약시각 전에는 누를 수 없다 (매뉴얼 4단계)");
    // =============================================================

    // 내일 예약 → 아직 예약시각이 오지 않았다.
    const tomorrow = new Date(Date.now() + 86_400_000 + 9 * 3600_000)
        .toISOString()
        .slice(0, 10);
    const future = await makeService(
        customerId,
        partnerId,
        "FUTURE",
        tomorrow,
        "09:00",
    );

    const early = await partner.rpc("start_service", {
        p_service_id: future.serviceId,
    });
    check(
        "예약시각 전 시작은 거절된다",
        !!early.error && early.error.message.includes("too_early"),
        early.error?.message,
    );

    // 오늘 00:00 예약 → 이미 지났다.
    const past = await makeService(
        customerId,
        partnerId,
        "PAST",
        todayKst(),
        "00:00",
    );
    const started = await partner.rpc("start_service", {
        p_service_id: past.serviceId,
    });
    check("예약시각 이후에는 시작된다", !started.error, started.error?.message);

    // =============================================================
    section("진행 시각 — 서버가 찍고, 덮어쓰지 않는다");
    // =============================================================

    const rec = await partner.rpc("record_service_time", {
        p_service_id: past.serviceId,
        p_field: "hospital_arrived_at",
    });
    check("진행 시각이 기록된다", !rec.error && !!rec.data, rec.error?.message);

    const first = rec.data;
    await new Promise((r) => setTimeout(r, 1100));
    const again = await partner.rpc("record_service_time", {
        p_service_id: past.serviceId,
        p_field: "hospital_arrived_at",
    });
    check(
        "두 번 눌러도 처음 시각이 남는다",
        again.data === first,
        `${first} → ${again.data}`,
    );

    const bad = await partner.rpc("record_service_time", {
        p_service_id: past.serviceId,
        p_field: "ended_at",
    });
    check(
        "화이트리스트에 없는 항목은 거절된다",
        !!bad.error && bad.error.message.includes("invalid_field"),
    );

    const notStarted = await partner.rpc("record_service_time", {
        p_service_id: future.serviceId,
        p_field: "hospital_arrived_at",
    });
    check("시작 전에는 진행 시각을 기록할 수 없다", !!notStarted.error);

    const notifyBefore = await partner.rpc("record_service_time", {
        p_service_id: future.serviceId,
        p_field: "notified_at",
    });
    check(
        "도착 통보만은 시작 전에도 기록된다 (매뉴얼 4단계)",
        !notifyBefore.error,
        notifyBefore.error?.message,
    );

    const asUser = await user.rpc("record_service_time", {
        p_service_id: past.serviceId,
        p_field: "reception_at",
    });
    check("남의 서비스에는 기록할 수 없다", !!asUser.error);

    // =============================================================
    section("리포트는 시각을 따로 갖지 않는다 (매뉴얼 14단계)");
    // =============================================================
    //  파트너가 버튼으로 시각을 남긴 뒤 리포트에서 손으로 다시 치던 칸이
    //  있었다. 그러면 보호자가 보는 시간과 청구되는 시간이 갈린다 —
    //  약관 제12조 ④ 는 둘을 "함께 확인" 하라고 하는데 함께 확인하면
    //  서로 달랐다. 저장할 자리를 없애 손으로 칠 수 없게 만들었다.

    const withTypedTime = await admin
        .from("reports")
        .insert({
            service_id: past.serviceId,
            partner_id: past.partnerId,
            status: "DRAFT",
            meet_time: "09:00",
        })
        .select("id");
    check(
        "리포트에 시각을 손으로 넣을 자리가 없다",
        !!withTypedTime.error,
        withTypedTime.error?.message ?? "insert 가 성공해 버렸다",
    );

    // 대신 같은 사실이 services 에 그대로 있다 — 리포트는 이것을 읽는다.
    const { data: svcTimes } = await admin
        .from("services")
        .select("started_at, hospital_arrived_at")
        .eq("id", past.serviceId)
        .maybeSingle();
    check(
        "리포트가 읽어 갈 시각은 services 에 남아 있다",
        !!svcTimes?.started_at && !!svcTimes?.hospital_arrived_at,
        JSON.stringify(svcTimes),
    );

    // =============================================================
    section("현장 고지·오류 기록 (대응카드 13 · 26)");
    // =============================================================
    //  매뉴얼은 파트너가 현장에서 판단하는 것을 막는다.
    //    대응카드 13 — "추가시간을 현장에서 확정하지 않는다"
    //    대응카드 26 — "임의의 시각을 입력하지 않는다"
    //  그래서 파트너는 사실만 남기고, 반영은 운영센터가 한다.

    const overrun = await partner.rpc("report_service_notice", {
        p_service_id: past.serviceId,
        p_kind: "OVERRUN_NOTICE",
        p_occurred_at: new Date().toISOString(),
        p_notified_to: "BOTH",
        p_detail: "검사 순서가 밀려 40분 지연",
    });
    check(
        "예정 종료 초과 고지가 기록된다",
        !overrun.error && !!overrun.data,
        overrun.error?.message,
    );

    const btnErr = await partner.rpc("report_service_notice", {
        p_service_id: past.serviceId,
        p_kind: "BUTTON_ERROR",
        p_occurred_at: new Date().toISOString(),
        p_error_text: "처리에 실패했습니다",
        p_detail: "지하 1층, 데이터 끊김",
    });
    check("버튼 오류가 신고된다", !btnErr.error, btnErr.error?.message);

    const futureNotice = await partner.rpc("report_service_notice", {
        p_service_id: past.serviceId,
        p_kind: "BUTTON_ERROR",
        p_occurred_at: new Date(Date.now() + 3_600_000).toISOString(),
        p_error_text: "미래 시각",
    });
    check(
        "아직 오지 않은 시각은 신고할 수 없다",
        !!futureNotice.error &&
            futureNotice.error.message.includes("future_time"),
        futureNotice.error?.message,
    );

    const badKind = await partner.rpc("report_service_notice", {
        p_service_id: past.serviceId,
        p_kind: "WHATEVER",
        p_occurred_at: new Date().toISOString(),
    });
    check("정해진 종류만 신고할 수 있다", !!badKind.error);

    const otherPartner = await user.rpc("report_service_notice", {
        p_service_id: past.serviceId,
        p_kind: "BUTTON_ERROR",
        p_occurred_at: new Date().toISOString(),
        p_error_text: "남의 서비스",
    });
    check("남의 서비스에는 신고할 수 없다", !!otherPartner.error);

    // 파트너는 자기 기록을 확인할 수 있어야 한다 — 현장 확인표가 요구한다.
    const mine = await partner
        .from("service_notices")
        .select("id")
        .eq("service_id", past.serviceId);
    check(
        "파트너는 자기가 남긴 기록을 볼 수 있다",
        !mine.error && (mine.data ?? []).length >= 2,
        `${(mine.data ?? []).length}건`,
    );

    const notMine = await user.from("service_notices").select("id");
    check(
        "다른 사람은 그 기록을 읽지 못한다",
        !notMine.error && (notMine.data ?? []).length === 0,
    );

    // 정정은 파트너의 일이 아니다 — 관리자 RPC 로만 열린다.
    const partnerFix = await partner.rpc("admin_correct_service_time", {
        p_service_id: past.serviceId,
        p_field: "started_at",
        p_at: new Date().toISOString(),
        p_reason: "파트너가 직접 고쳐본다",
    });
    check("파트너는 시각을 직접 정정할 수 없다", !!partnerFix.error);

    // =============================================================
    section("이용자 미도착 종료 — 약관 제15조 ③④");
    // =============================================================

    const tooSoon = await partner.rpc("end_service_no_show", {
        p_service_id: past.serviceId,
    });
    check(
        "시작 후 20분 전에는 종료할 수 없다",
        !!tooSoon.error && tooSoon.error.message.includes("too_early"),
        tooSoon.error?.message,
    );

    // 20분이 지난 것으로 만든다.
    await admin
        .from("services")
        .update({
            started_at: new Date(Date.now() - 21 * 60_000).toISOString(),
        })
        .eq("id", past.serviceId);

    const noShow = await partner.rpc("end_service_no_show", {
        p_service_id: past.serviceId,
    });
    check("20분이 지나면 종료된다", !noShow.error, noShow.error?.message);

    const { data: closed } = await admin
        .from("services")
        .select("status, no_show, ended_at")
        .eq("id", past.serviceId)
        .single();
    check(
        "노쇼로 표시되고 종료 시각이 남는다",
        closed?.status === "ENDED" &&
            closed?.no_show === true &&
            !!closed?.ended_at,
        JSON.stringify(closed),
    );

    // =============================================================
    section("종료 버튼 누락 자동 마감");
    // =============================================================

    const stale = await makeService(
        customerId,
        partnerId,
        "STALE",
        todayKst(),
        "00:00",
    );
    // 6시간 전에 시작 → 예정 종료(+2시간) 이후 3시간이 지났다.
    const startedAt = new Date(Date.now() - 6 * 3600_000);
    await admin
        .from("services")
        .update({ status: "IN_PROGRESS", started_at: startedAt.toISOString() })
        .eq("id", stale.serviceId);

    const fresh = await makeService(
        customerId,
        partnerId,
        "FRESH",
        todayKst(),
        "00:00",
    );
    await admin
        .from("services")
        .update({
            status: "IN_PROGRESS",
            started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        })
        .eq("id", fresh.serviceId);

    const swept = await admin.rpc("auto_close_stale_services");
    check("자동 마감이 실행된다", !swept.error, swept.error?.message);

    const { data: staleRow } = await admin
        .from("services")
        .select("status, ended_at, auto_closed_at")
        .eq("id", stale.serviceId)
        .single();
    check(
        "예정 종료 +3시간이 지난 건은 마감된다",
        staleRow?.status === "ENDED" && !!staleRow?.auto_closed_at,
        JSON.stringify(staleRow),
    );

    // 과청구를 막는 핵심 — 마감 시각이 아니라 예정 종료시각으로 적는다.
    const plannedEnd = new Date(startedAt.getTime() + 120 * 60_000);
    const endedDiffMin = staleRow?.ended_at
        ? Math.abs(
              new Date(staleRow.ended_at).getTime() - plannedEnd.getTime(),
          ) / 60_000
        : 999;
    check(
        "종료 시각은 예정 종료시각으로 적는다 (과청구 방지)",
        endedDiffMin < 1,
        `차이 ${endedDiffMin.toFixed(1)}분`,
    );

    const { data: freshRow } = await admin
        .from("services")
        .select("status")
        .eq("id", fresh.serviceId)
        .single();
    check(
        "진행 중인 건은 건드리지 않는다",
        freshRow?.status === "IN_PROGRESS",
        freshRow?.status,
    );

    // 18시 상한이 예정 종료보다 이르면 예정 종료가 이긴다.
    // 상한을 그대로 쓰면 아직 끝나지 않은 서비스가 시작하자마자 마감된다.
    const late = await makeService(
        customerId,
        partnerId,
        "LATE",
        todayKst(),
        "00:00",
    );
    // 이틀 전 20:00(KST) 시작 → 예정 종료 22:00, 당일 상한 18:00 (이미 지남)
    const lateStart = new Date(Date.now() - 2 * 86_400_000);
    lateStart.setUTCHours(11, 0, 0, 0); // 20:00 KST
    await admin
        .from("services")
        .update({
            status: "IN_PROGRESS",
            started_at: lateStart.toISOString(),
        })
        .eq("id", late.serviceId);

    await admin.rpc("auto_close_stale_services");
    const { data: lateRow } = await admin
        .from("services")
        .select("status, ended_at")
        .eq("id", late.serviceId)
        .single();
    const latePlanned = new Date(lateStart.getTime() + 120 * 60_000);
    const lateDiffMin = lateRow?.ended_at
        ? Math.abs(
              new Date(lateRow.ended_at).getTime() - latePlanned.getTime(),
          ) / 60_000
        : 999;
    check(
        "예정 종료가 18시를 넘으면 상한이 아니라 예정 종료로 마감된다",
        lateRow?.status === "ENDED" && lateDiffMin < 1,
        `${lateRow?.status} · 차이 ${lateDiffMin.toFixed(1)}분`,
    );

    // 정기 배치가 자동 마감을 실제로 부르는지 본다. 함수만 있고 아무도
    // 부르지 않으면 종료 누락 건이 영영 "진행 중" 으로 남는다.
    const orphan = await makeService(
        customerId,
        partnerId,
        "ORPHAN",
        todayKst(),
        "00:00",
    );
    await admin
        .from("services")
        .update({
            status: "IN_PROGRESS",
            started_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
        })
        .eq("id", orphan.serviceId);

    const sweep = await admin.rpc("run_expiry_sweep");
    const { data: orphanRow } = await admin
        .from("services")
        .select("status, auto_closed_at")
        .eq("id", orphan.serviceId)
        .single();
    check(
        "정기 배치가 종료 누락 건을 마감한다",
        !sweep.error &&
            typeof sweep.data?.closed === "number" &&
            orphanRow?.status === "ENDED" &&
            !!orphanRow?.auto_closed_at,
        sweep.error?.message ?? JSON.stringify(sweep.data),
    );

    const byUser = await user.rpc("auto_close_stale_services");
    check("일반 사용자는 자동 마감을 호출할 수 없다", !!byUser.error);

    // =============================================================
    section("예약 취소 사유 기록");
    // =============================================================
    //  이용자가 매칭 화면을 열어 둔 사이 예약이 자동 취소되면 화면은 계속
    //  "매칭 진행 중" 을 보여줬다. 화면이 판단하려면 상태와 **사유**가
    //  필요하다. 사유가 비면 "누가 취소했는지" 를 말할 수 없다.

    /** 매칭 상태 예약 하나 (서비스 없이) */
    async function makeMatching(code, arriveTime, useDate) {
        const { data, error } = await admin
            .from("reservations")
            .insert({
                code,
                customer_id: customerId,
                status: "MATCHING",
                plan: "basic",
                patient_name: "취소테스트",
                patient_birth: "1960-01-01",
                patient_gender: "male",
                patient_phone: "010-0000-0000",
                guardian_name: "보호자",
                guardian_phone: "010-0000-0000",
                relation: "본인",
                treatment: "내과",
                purpose: "검진",
                use_date: useDate,
                arrive_time: arriveTime,
                reserve_time: "23시 00분",
                duration: "2시간",
                duration_minutes: 120,
                depart_address: "출발지",
                hospital_address: "병원",
                hourly_rate: 20000,
                fee_rate: 0.2,
                surcharge_rate: 0,
                prepaid_amount: 40000,
            })
            .select("id")
            .single();
        if (error) throw error;
        return data.id;
    }

    // 어제 도착 시각 → 자동 만료 대상
    const yesterday = new Date(Date.now() - 86_400_000)
        .toISOString()
        .slice(0, 10);
    const expiredId = await makeMatching(
        `${CODE_PREFIX}-CANCEL-EXP`,
        "10시 00분",
        yesterday,
    );

    await admin.rpc("expire_past_matchings");

    const { data: expiredRow } = await admin
        .from("reservations")
        .select("status, cancel_reason, cancelled_at")
        .eq("id", expiredId)
        .maybeSingle();
    check(
        "자동 만료는 EXPIRED 로 남는다",
        expiredRow?.status === "CANCELLED" &&
            expiredRow?.cancel_reason === "EXPIRED" &&
            !!expiredRow?.cancelled_at,
        JSON.stringify(expiredRow),
    );

    // 이용자 본인 취소 → USER
    const cancelTomorrow = new Date(Date.now() + 86_400_000)
        .toISOString()
        .slice(0, 10);
    const mineId = await makeMatching(
        `${CODE_PREFIX}-CANCEL-USER`,
        "10시 00분",
        cancelTomorrow,
    );

    const cancelByUser = await user.rpc("cancel_matching_reservation", {
        p_reservation_id: mineId,
    });
    const { data: userRow } = await admin
        .from("reservations")
        .select("status, cancel_reason")
        .eq("id", mineId)
        .maybeSingle();
    check(
        "본인 취소는 USER 로 남는다",
        cancelByUser.data === true &&
            userRow?.status === "CANCELLED" &&
            userRow?.cancel_reason === "USER",
        JSON.stringify({ rpc: cancelByUser.data, row: userRow }),
    );

    // 남의 예약은 취소할 수 없다
    const otherId = await makeMatching(
        `${CODE_PREFIX}-CANCEL-OTHER`,
        "10시 00분",
        cancelTomorrow,
    );
    const byPartner = await partner.rpc("cancel_matching_reservation", {
        p_reservation_id: otherId,
    });
    check("남의 예약은 취소할 수 없다", !!byPartner.error);

    // 이미 취소된 건을 다시 취소해도 조용히 false
    const cancelAgain = await user.rpc("cancel_matching_reservation", {
        p_reservation_id: mineId,
    });
    check("이미 취소된 건은 false 를 돌려준다", cancelAgain.data === false);

    await partner.auth.signOut();
    await user.auth.signOut();
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

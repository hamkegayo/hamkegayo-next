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
    return { reservationId: res.id, serviceId: svc.id };
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

    const byUser = await user.rpc("auto_close_stale_services");
    check("일반 사용자는 자동 마감을 호출할 수 없다", !!byUser.error);

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

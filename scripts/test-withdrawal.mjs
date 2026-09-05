// 회원 탈퇴·보존기간 재현 테스트 (#72) — 로컬 전용.
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/test-withdrawal.mjs
//
// 사전 조건:
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) .env.local 이 로컬(127.0.0.1:54321) 블록을 가리킬 것
//
// 안전장치: NEXT_PUBLIC_SUPABASE_URL 이 localhost/127.0.0.1 이 아니면 즉시 중단한다.
//
// 왜 별도 스크립트인가:
//   탈퇴는 **계정을 지우는 것처럼 보이는 동작**이라 공용 시드 계정으로 돌릴 수 없다.
//   매번 일회용 계정을 만들어 쓰고 끝나면 지운다.
//
// 이 테스트가 지키려는 것 한 줄:
//   탈퇴해도 결제·정산·수행기록은 남고, 이름·연락처는 사라진다.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error(
        "❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
    );
    console.error(
        "   예) node --env-file=.env.local scripts/test-withdrawal.mjs",
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

const PREFIX = "TEST-72";
const stamp = Date.now();

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

/** 일회용 회원 하나. 반환값은 auth user id 다. */
async function makeMember(kind) {
    const email = `${PREFIX}-${kind}-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password: "test1234!",
        email_confirm: true,
    });
    if (error) throw error;

    // 가입 트리거가 없을 수 있으므로 프로필을 직접 만든다.
    await admin.from("profiles").upsert({
        id: data.user.id,
        role: kind === "partner" ? "PARTNER" : "USER",
        name: `탈퇴테스트${kind}`,
        phone: "010-7272-7272",
        email,
        status: "ACTIVE",
    });

    return { id: data.user.id, email };
}

async function cleanup() {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
        const mail = u.email ?? "";
        // 탈퇴하면 이메일이 .invalid 로 바뀌므로 그쪽도 함께 훑는다.
        if (mail.startsWith(PREFIX) || mail.includes(`withdrawn+${u.id}`)) {
            await admin.from("reservations").delete().eq("customer_id", u.id);
            await admin
                .from("withdrawn_members")
                .delete()
                .eq("profile_id", u.id);
            await admin.auth.admin.deleteUser(u.id);
        }
    }
    await admin.from("reservations").delete().like("code", `${PREFIX}%`);
}

async function main() {
    await cleanup();

    // =============================================================
    console.log("\n▶ 탈퇴 시 거래기록 보존 (처리방침 제4조 · 제11조 ②)");
    // =============================================================
    const member = await makeMember("user");

    // 완료된 예약 + 결제. 탈퇴 후에도 남아야 하는 것들이다.
    const { data: reservation, error: rErr } = await admin
        .from("reservations")
        .insert({
            code: `${PREFIX}-A`,
            customer_id: member.id,
            status: "COMPLETED",
            plan: "basic",
            patient_name: "홍길동",
            patient_birth: "1950-01-01",
            patient_gender: "male",
            patient_phone: "010-0000-0000",
            guardian_name: "보호자",
            guardian_phone: "010-1111-1111",
            relation: "자녀",
            treatment: "내과",
            purpose: "검진",
            use_date: "2026-09-07",
            arrive_time: "9시 00분",
            reserve_time: "10시 00분",
            duration: "2시간",
            depart_address: "출발지",
            hospital_address: "병원",
            duration_minutes: 120,
            hourly_rate: 20000,
            fee_rate: 0.2,
            surcharge_rate: 0,
            prepaid_amount: 40000,
        })
        .select("id")
        .single();
    if (rErr) throw rErr;

    await admin.from("payments").insert({
        reservation_id: reservation.id,
        type: "BASE",
        status: "PAID",
        order_id: `${PREFIX}-ORD-A`,
        gross_amount: 40000,
        discount_amount: 0,
        commission_amount: 8000,
        payout_amount: 32000,
        commission_rate: 0.2,
        paid_at: new Date().toISOString(),
    });

    const { error: wErr } = await admin.rpc("withdraw_member", {
        p_user_id: member.id,
        p_reason: "테스트",
    });
    check("탈퇴가 처리된다", !wErr, wErr?.message);

    // ---------- 남아야 하는 것 ----------
    const { data: keptPayment } = await admin
        .from("payments")
        .select("id, gross_amount")
        .eq("order_id", `${PREFIX}-ORD-A`)
        .maybeSingle();
    check(
        "결제 기록이 남는다 (제4조 — 대금결제 5년)",
        keptPayment?.gross_amount === 40000,
    );

    const { data: keptReservation } = await admin
        .from("reservations")
        .select("id, status")
        .eq("id", reservation.id)
        .maybeSingle();
    check("예약 기록이 남는다", keptReservation?.status === "COMPLETED");

    const { data: keptProfile } = await admin
        .from("profiles")
        .select("id, name, phone, email, status, withdrawn_at")
        .eq("id", member.id)
        .maybeSingle();
    check(
        "프로필 행 자체는 남는다 (지우면 cascade 로 결제가 함께 사라진다)",
        !!keptProfile,
    );

    // ---------- 사라져야 하는 것 ----------
    check(
        "이름이 지워진다",
        keptProfile?.name === "탈퇴회원",
        keptProfile?.name,
    );
    check("연락처가 지워진다", keptProfile?.phone === null);
    check("이메일이 지워진다", keptProfile?.email === null);
    check(
        "상태가 WITHDRAWN 이 된다 (기존 ACTIVE 게이트가 전부 막는다)",
        keptProfile?.status === "WITHDRAWN" && !!keptProfile?.withdrawn_at,
    );

    // ---------- 분리 보관 ----------
    const { data: kept } = await admin
        .from("withdrawn_members")
        .select("name, phone, email, purge_after")
        .eq("profile_id", member.id)
        .maybeSingle();
    check(
        "식별정보가 분리 보관된다 (제11조 ②)",
        kept?.name === "탈퇴테스트user" && kept?.email === member.email,
        JSON.stringify(kept),
    );

    const years =
        (new Date(kept.purge_after).getTime() - Date.now()) /
        (365.25 * 86_400_000);
    check(
        "파기 예정일이 3년 뒤다 (제4조 — 탈퇴 후 3년)",
        years > 2.9 && years < 3.1,
        `${years.toFixed(2)}년`,
    );

    // ---------- 멱등 ----------
    const { data: again, error: againErr } = await admin.rpc(
        "withdraw_member",
        { p_user_id: member.id },
    );
    check(
        "두 번 눌러도 안전하다",
        !againErr && again?.already === true,
        againErr?.message,
    );

    // =============================================================
    console.log("\n▶ 분리 보관본 접근 차단 (제11조 ②)");
    // =============================================================
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) {
        const anon = createClient(url, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: leaked } = await anon
            .from("withdrawn_members")
            .select("name");
        check(
            "비로그인은 분리 보관본을 읽을 수 없다",
            (leaked ?? []).length === 0,
        );
    }

    // =============================================================
    console.log("\n▶ 탈퇴 거절 조건 (약관 제22조 ③)");
    // =============================================================
    const debtor = await makeMember("debtor");

    const { data: dueReservation } = await admin
        .from("reservations")
        .insert({
            code: `${PREFIX}-B`,
            customer_id: debtor.id,
            status: "COMPLETED",
            plan: "basic",
            patient_name: "홍길동",
            patient_birth: "1950-01-01",
            patient_gender: "male",
            patient_phone: "010-0000-0000",
            guardian_name: "보호자",
            guardian_phone: "010-1111-1111",
            relation: "자녀",
            treatment: "내과",
            purpose: "검진",
            use_date: "2026-09-07",
            arrive_time: "9시 00분",
            reserve_time: "10시 00분",
            duration: "2시간",
            depart_address: "출발지",
            hospital_address: "병원",
            duration_minutes: 120,
            hourly_rate: 20000,
            fee_rate: 0.2,
            surcharge_rate: 0,
            prepaid_amount: 40000,
        })
        .select("id")
        .single();

    // 기한이 지난 미납 추가결제
    await admin.from("payments").insert({
        reservation_id: dueReservation.id,
        type: "EXTENSION",
        status: "PENDING",
        order_id: `${PREFIX}-ORD-B`,
        gross_amount: 12000,
        discount_amount: 0,
        commission_amount: 0,
        payout_amount: 12000,
        commission_rate: 0,
        link_sent_at: new Date(Date.now() - 86_400_000).toISOString(),
        token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const { error: debtErr } = await admin.rpc("withdraw_member", {
        p_user_id: debtor.id,
    });
    check(
        "미납이 있으면 탈퇴가 거절된다",
        debtErr?.message?.includes("UNPAID_CHARGE") === true,
        debtErr?.message,
    );

    const { data: stillThere } = await admin
        .from("profiles")
        .select("name, status")
        .eq("id", debtor.id)
        .maybeSingle();
    check(
        "거절되면 아무것도 바뀌지 않는다",
        stillThere?.status === "ACTIVE" && stillThere?.name !== "탈퇴회원",
    );

    // 진행 예정 예약
    const pendingUser = await makeMember("booked");
    await admin.from("reservations").insert({
        code: `${PREFIX}-C`,
        customer_id: pendingUser.id,
        status: "CONFIRMED",
        plan: "basic",
        patient_name: "홍길동",
        patient_birth: "1950-01-01",
        patient_gender: "male",
        patient_phone: "010-0000-0000",
        guardian_name: "보호자",
        guardian_phone: "010-1111-1111",
        relation: "자녀",
        treatment: "내과",
        purpose: "검진",
        use_date: "2026-09-07",
        arrive_time: "9시 00분",
        reserve_time: "10시 00분",
        duration: "2시간",
        depart_address: "출발지",
        hospital_address: "병원",
        duration_minutes: 120,
        hourly_rate: 20000,
        fee_rate: 0.2,
        surcharge_rate: 0,
        prepaid_amount: 40000,
    });

    const { error: bookedErr } = await admin.rpc("withdraw_member", {
        p_user_id: pendingUser.id,
    });
    check(
        "진행 예정 예약이 있으면 거절된다 (파트너가 시간을 비워 뒀다)",
        bookedErr?.message?.includes("ACTIVE_RESERVATION") === true,
        bookedErr?.message,
    );

    // =============================================================
    console.log("\n▶ 보존기간 파기 (제11조 ①)");
    // =============================================================
    // 파기 예정일을 과거로 당겨 배치가 실제로 지우는지 본다.
    await admin
        .from("withdrawn_members")
        .update({ purge_after: new Date(Date.now() - 60_000).toISOString() })
        .eq("profile_id", member.id);

    const { data: purge, error: purgeErr } = await admin.rpc(
        "run_retention_purge",
    );
    check("파기 배치가 돈다", !purgeErr, purgeErr?.message);

    const { data: gone } = await admin
        .from("withdrawn_members")
        .select("profile_id")
        .eq("profile_id", member.id)
        .maybeSingle();
    check(
        "3년이 지난 분리 보관본은 파기된다",
        !gone && purge?.withdrawn_purged >= 1,
        JSON.stringify(purge),
    );

    const { data: survivedPayment } = await admin
        .from("payments")
        .select("id")
        .eq("order_id", `${PREFIX}-ORD-A`)
        .maybeSingle();
    check("식별정보를 파기해도 거래기록은 남는다 (5년)", !!survivedPayment);

    await cleanup();

    console.log(
        `\n${failed === 0 ? "🎉" : "⚠️"}  ${passed}건 통과 / ${failed}건 실패`,
    );
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
    console.error("\n💥 실행 중 오류:", e);
    await cleanup().catch(() => {});
    process.exit(1);
});

// 결제·정산 스키마 재현 테스트 (#49) — 로컬 전용.
//
// 실행 (Node 20.6+):
//   node --env-file=.env.local scripts/test-payment-flow.mjs
//
// 사전 조건:
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) `node --env-file=.env.local scripts/seed-dev.mjs` 로 테스트 계정이 있을 것
//   3) .env.local 이 로컬(127.0.0.1:54321) 블록을 가리킬 것
//
// 안전장치: NEXT_PUBLIC_SUPABASE_URL 이 localhost/127.0.0.1 이 아니면 즉시 중단한다.
//
// 왜 스크립트인가:
//   #49 는 스키마·RPC 까지라 화면으로 만질 수 있는 지점이 없다. 그렇다고 psql 로
//   auth.uid() 를 갈아끼우면 실행 중인 앱의 RLS 가 깨진다. 그래서 **실제 로그인 세션**으로
//   RPC 를 호출해 권한 경계까지 함께 검증한다.
//
// 멱등: 시작·종료 시 이 스크립트가 만든 것만 지운다.
//   - 예약   : code 가 TEST-49 로 시작하는 행
//   - 포인트 : memo 가 TEST-49 인 행 (화면 확인용으로 넣어둔 포인트는 건드리지 않는다)
// 반복 실행해도 안전하다.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
    console.error(
        "❌ NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY 가 필요합니다.",
    );
    console.error(
        "   예) node --env-file=.env.local scripts/test-payment-flow.mjs",
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
const PARTNER_LOGIN_ID = process.env.PARTNER_LOGIN_ID ?? "tpart01";
const partnerEmail = `${PARTNER_LOGIN_ID.trim().toLowerCase()}@partner.hamkegayo.internal`;

const CODE_PREFIX = "TEST-49";
/** 포인트 원장에서 이 스크립트가 만든 행을 구분하는 표시 */
const POINT_MEMO = "TEST-49";

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

/** RPC 가 특정 예외로 거절되는지 확인한다 */
async function expectRpcError(name, promise, expectedCode) {
    const { error } = await promise;
    if (!error) return check(name, false, "거절되지 않고 성공했습니다");
    check(name, error.message.includes(expectedCode), `실제: ${error.message}`);
}

// ---------------------------------------------------------------
// 준비
// ---------------------------------------------------------------
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

async function cleanup() {
    await admin.from("reservations").delete().like("code", `${CODE_PREFIX}%`);
}

/** 이 스크립트가 만든 포인트 행만 지운다 (화면 확인용 데이터는 보존) */
async function clearTestPoints(userId) {
    await admin
        .from("points")
        .delete()
        .eq("user_id", userId)
        .eq("memo", POINT_MEMO);
}

/** MATCHING 예약 + 파트너 ACCEPTED 지원건 생성 */
async function makeReservation(
    customerId,
    partnerId,
    suffix,
    arriveTime,
    minutes,
) {
    const { data, error } = await admin
        .from("reservations")
        .insert({
            code: `${CODE_PREFIX}-${suffix}`,
            customer_id: customerId,
            status: "MATCHING",
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
            arrive_time: arriveTime,
            reserve_time: "10시 00분",
            duration: "2시간",
            depart_address: "출발지",
            hospital_address: "병원",
            duration_minutes: minutes,
            hourly_rate: 20000,
            fee_rate: 0.2,
            surcharge_rate: 0,
            prepaid_amount: 40000,
        })
        .select("id")
        .single();
    if (error) throw error;

    const { error: appErr } = await admin
        .from("reservation_applications")
        .insert({
            reservation_id: data.id,
            partner_id: partnerId,
            status: "ACCEPTED",
        });
    if (appErr) throw appErr;

    return data.id;
}

// ---------------------------------------------------------------
// 본 테스트
// ---------------------------------------------------------------
async function main() {
    const customerId = await findUserId(USER_EMAIL);
    const partnerId = await findUserId(partnerEmail);

    await cleanup();

    // 고객 세션 — RLS 와 auth.uid() 가 실제로 적용된다
    const user = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: loginErr } = await user.auth.signInWithPassword({
        email: USER_EMAIL,
        password: USER_PASSWORD,
    });
    if (loginErr) throw new Error(`고객 로그인 실패: ${loginErr.message}`);

    // 10:00~12:00 / 11:00~13:00(겹침) / 14:00~16:00(안 겹침)
    const r1 = await makeReservation(
        customerId,
        partnerId,
        "A",
        "10시 00분",
        120,
    );
    const r2 = await makeReservation(
        customerId,
        partnerId,
        "B",
        "11시 00분",
        120,
    );
    const r3 = await makeReservation(
        customerId,
        partnerId,
        "C",
        "14시 00분",
        120,
    );

    console.log("\n▶ 파트너 선택 (약관 제9조 ④ — 선택만, 확정 아님)");

    const { data: deadline, error: selErr } = await user.rpc(
        "select_reservation_partner",
        {
            p_reservation_id: r1,
            p_partner_id: partnerId,
        },
    );
    check("선택 RPC 성공", !selErr, selErr?.message);

    const { data: after } = await admin
        .from("reservations")
        .select("status, confirmed_partner_id, payment_deadline")
        .eq("id", r1)
        .single();
    check(
        "선택해도 MATCHING 유지",
        after?.status === "MATCHING",
        `실제: ${after?.status}`,
    );
    check("확정 파트너 기록", after?.confirmed_partner_id === partnerId);

    const gapMin = (new Date(deadline).getTime() - Date.now()) / 60000;
    check(
        `결제 기한 30분 (실제 ${gapMin.toFixed(1)}분)`,
        gapMin > 29 && gapMin <= 30.5,
    );

    console.log("\n▶ 소프트 홀드 (겹치는 시간대)");

    await expectRpcError(
        "겹치는 시간대 같은 파트너 차단",
        user.rpc("select_reservation_partner", {
            p_reservation_id: r2,
            p_partner_id: partnerId,
        }),
        "partner_unavailable",
    );

    const { error: okErr } = await user.rpc("select_reservation_partner", {
        p_reservation_id: r3,
        p_partner_id: partnerId,
    });
    check("안 겹치는 시간대는 허용", !okErr, okErr?.message);

    console.log("\n▶ 결제 → 확정");

    const { data: payment, error: payErr } = await admin
        .from("payments")
        .insert({
            reservation_id: r1,
            type: "BASE",
            status: "PENDING",
            order_id: `${CODE_PREFIX}-ORD-A`,
            gross_amount: 40000,
            commission_amount: 8000,
            payout_amount: 32000,
            commission_rate: 0.2,
        })
        .select("id")
        .single();
    check("결제 행 생성", !payErr, payErr?.message);

    await expectRpcError(
        "고객은 확정 RPC 를 직접 호출할 수 없음",
        user.rpc("confirm_reservation_payment", {
            p_reservation_id: r1,
            p_payment_id: payment?.id,
        }),
        "",
    );

    await expectRpcError(
        "미결제 상태로는 확정 거절",
        admin.rpc("confirm_reservation_payment", {
            p_reservation_id: r1,
            p_payment_id: payment?.id,
        }),
        "payment_not_paid",
    );

    await admin
        .from("payments")
        .update({ status: "PAID", paid_at: new Date().toISOString() })
        .eq("id", payment.id);

    const { error: confirmErr } = await admin.rpc(
        "confirm_reservation_payment",
        {
            p_reservation_id: r1,
            p_payment_id: payment.id,
        },
    );
    check("결제 성공 후 확정", !confirmErr, confirmErr?.message);

    const { data: confirmed } = await admin
        .from("reservations")
        .select("status, payment_deadline")
        .eq("id", r1)
        .single();
    check(
        "CONFIRMED 전이 + 기한 해제",
        confirmed?.status === "CONFIRMED" &&
            confirmed?.payment_deadline === null,
    );

    console.log("\n▶ 결제 기한 만료");

    await admin
        .from("reservations")
        .update({
            payment_deadline: new Date(Date.now() - 60_000).toISOString(),
        })
        .eq("id", r3);

    const { data: released } = await admin.rpc("release_expired_selections");
    check(`만료 선택 해제 (${released}건)`, released >= 1);

    const { data: r3After } = await admin
        .from("reservations")
        .select("status, confirmed_partner_id")
        .eq("id", r3)
        .single();
    check(
        "선택만 해제되고 MATCHING 유지",
        r3After?.status === "MATCHING" &&
            r3After?.confirmed_partner_id === null,
    );

    const { count: stillAccepted } = await admin
        .from("reservation_applications")
        .select("id", { count: "exact", head: true })
        .eq("reservation_id", r3)
        .eq("status", "ACCEPTED");
    check("지원건 유지 → 즉시 재선택 가능", stillAccepted === 1);

    console.log("\n▶ 금액 제약 · 환불 (약관 제19조 ② · 제21조 ④)");

    const { error: badErr } = await admin.from("payments").insert({
        reservation_id: r1,
        type: "BASE",
        order_id: `${CODE_PREFIX}-ORD-BAD`,
        gross_amount: 40000,
        commission_amount: 8000,
        payout_amount: 99999,
    });
    check(
        "3분할 check 위반 거절",
        !!badErr,
        badErr ? undefined : "삽입이 통과했습니다",
    );

    // 선결제 40,000 / 취소수수료 10,000 → 환불 30,000, 실수취 10,000
    await admin.from("payments").insert({
        reservation_id: r1,
        type: "REFUND",
        status: "PAID",
        order_id: `${CODE_PREFIX}-ORD-R`,
        gross_amount: -30000,
        commission_amount: -6000,
        payout_amount: -24000,
        cancel_fee_amount: 10000,
    });

    const { data: rows } = await admin
        .from("payments")
        .select("gross_amount")
        .eq("reservation_id", r1)
        .eq("status", "PAID");
    const net = rows.reduce((s, r) => s + r.gross_amount, 0);
    check(
        `환불 반영 실수취액 10,000 (실제 ${net.toLocaleString()})`,
        net === 10000,
    );

    console.log("\n▶ 취소 환불 (약관 제19조 · #76)");

    // 선결제 40,000 / 포인트 5,000 사용 → PG 결제 35,000
    const r4 = await makeReservation(customerId, partnerId, "R4", "9시", 120);
    const { data: pay4 } = await admin
        .from("payments")
        .insert({
            reservation_id: r4,
            type: "BASE",
            status: "PAID",
            order_id: `${CODE_PREFIX}-ORD-4`,
            gross_amount: 40000,
            discount_amount: 5000,
            commission_amount: 3000,
            payout_amount: 32000,
            commission_rate: 0.2,
            paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();

    // 포인트 사용 이력 — 환불 시 USE_CANCEL 로 복원되어야 한다.
    await admin.from("points").insert({
        user_id: customerId,
        amount: -5000,
        reason: "USE",
        reservation_id: r4,
        payment_id: pay4.id,
        memo: POINT_MEMO,
    });

    // 취소수수료 10,000 → 현금 25,000 환불, 포인트 5,000 전액 복원
    const { data: refund, error: refundErr } = await admin.rpc(
        "refund_payment",
        {
            p_payment_id: pay4.id,
            p_cancel_fee: 10000,
            p_expected_cash: 25000,
            p_memo: POINT_MEMO,
        },
    );
    check("환불 RPC 성공", !refundErr, refundErr?.message);
    check(
        `현금 25,000 환불 · 수수료 10,000 (실제 ${refund?.cash} / ${refund?.cancel_fee})`,
        refund?.cash === 25000 && refund?.cancel_fee === 10000,
    );
    check(
        "포인트는 수수료와 무관하게 전액 복원된다",
        refund?.restored_points === 5000,
    );

    const { data: refundRow } = await admin
        .from("payments")
        .select(
            "gross_amount, discount_amount, commission_amount, payout_amount, cancel_fee_amount",
        )
        .eq("order_id", `${CODE_PREFIX}-ORD-4-R`)
        .single();
    check(
        "환불 행이 원 결제와 같은 공식을 음수로 기록한다",
        refundRow?.gross_amount === -30000 &&
            refundRow?.discount_amount === -5000 &&
            refundRow?.commission_amount === -1000 &&
            refundRow?.payout_amount === -24000,
        JSON.stringify(refundRow),
    );

    const { data: sumRows } = await admin
        .from("payments")
        .select("gross_amount, commission_amount, payout_amount")
        .eq("reservation_id", r4)
        .eq("status", "PAID");
    const net4 = sumRows.reduce((s, r) => s + r.gross_amount, 0);
    const netFee = sumRows.reduce((s, r) => s + r.commission_amount, 0);
    const netPayout = sumRows.reduce((s, r) => s + r.payout_amount, 0);
    check(`실수취액이 취소수수료와 같다 (${net4})`, net4 === 10000);
    check(
        `수수료율대로 분배된다 (플랫폼 ${netFee} / 파트너 ${netPayout})`,
        netFee === 2000 && netPayout === 8000,
    );

    const { data: res4 } = await admin
        .from("reservations")
        .select("status, confirmed_partner_id")
        .eq("id", r4)
        .single();
    check(
        "환불과 예약 취소가 한 트랜잭션에서 처리된다",
        res4?.status === "CANCELLED" && res4?.confirmed_partner_id === null,
    );

    // PG 취소는 성공했는데 기록에 실패해 재시도하는 상황.
    const { data: again } = await admin.rpc("refund_payment", {
        p_payment_id: pay4.id,
        p_cancel_fee: 10000,
        p_expected_cash: 25000,
    });
    const { count: refundCount } = await admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("reservation_id", r4)
        .eq("type", "REFUND");
    check(
        "두 번 불러도 환불이 한 번만 기록된다",
        again?.already === true && refundCount === 1,
    );

    const { data: dupRestore } = await admin.rpc("release_points", {
        p_payment_id: pay4.id,
    });
    check("포인트도 두 번 복원되지 않는다", dupRestore === 0);

    // 앱이 계산한 환불액과 DB 계산이 어긋나면 막아야 한다.
    const { data: pay5 } = await admin
        .from("payments")
        .insert({
            reservation_id: r4,
            type: "BASE",
            status: "PAID",
            order_id: `${CODE_PREFIX}-ORD-5`,
            gross_amount: 40000,
            discount_amount: 0,
            commission_amount: 8000,
            payout_amount: 32000,
            commission_rate: 0.2,
            paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    const { error: mismatchErr } = await admin.rpc("refund_payment", {
        p_payment_id: pay5.id,
        p_cancel_fee: 10000,
        p_expected_cash: 99999,
    });
    check("환불액이 어긋나면 거절한다", !!mismatchErr);

    const { error: refundDenied } = await user.rpc("refund_payment", {
        p_payment_id: pay5.id,
        p_cancel_fee: 0,
        p_expected_cash: 40000,
    });
    check("고객은 스스로 환불을 일으킬 수 없다", !!refundDenied);

    console.log("\n▶ 미달분 환불 승인 큐 (약관 제21조 ④ · #76)");

    // 서비스는 정상 완료됐고 최종요금이 선결제액보다 적은 상황.
    const r6 = await makeReservation(customerId, partnerId, "R6", "9시", 120);
    const { data: pay6 } = await admin
        .from("payments")
        .insert({
            reservation_id: r6,
            type: "BASE",
            status: "PAID",
            order_id: `${CODE_PREFIX}-ORD-6`,
            gross_amount: 40000,
            discount_amount: 0,
            commission_amount: 8000,
            payout_amount: 32000,
            commission_rate: 0.2,
            paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    const { data: svc6 } = await admin
        .from("services")
        .insert({ reservation_id: r6, partner_id: partnerId, status: "ENDED" })
        .select("id")
        .single();

    const { data: reqId, error: reqErr } = await admin.rpc(
        "request_settlement_refund",
        { p_reservation_id: r6, p_amount: 15000, p_reason: "테스트 미달분" },
    );
    check("미달분이 승인 큐에 쌓인다", !reqErr && !!reqId, reqErr?.message);

    const { data: queued } = await admin
        .from("refund_requests")
        .select("status, amount")
        .eq("id", reqId)
        .single();
    check(
        "PENDING 으로 시작한다 (자동 환불 아님)",
        queued?.status === "PENDING" && queued?.amount === 15000,
    );

    // 종료를 다시 눌러 금액이 재산정된 경우.
    await admin.rpc("request_settlement_refund", {
        p_reservation_id: r6,
        p_amount: 12000,
    });
    const { count: queueCount } = await admin
        .from("refund_requests")
        .select("id", { count: "exact", head: true })
        .eq("reservation_id", r6);
    const { data: requeued } = await admin
        .from("refund_requests")
        .select("amount")
        .eq("id", reqId)
        .single();
    check(
        "예약당 한 건이며 결정 전에는 금액이 갱신된다",
        queueCount === 1 && requeued?.amount === 12000,
    );

    const { error: earlyErr } = await admin.rpc("record_settlement_refund", {
        p_request_id: reqId,
    });
    check("승인 전에는 집행되지 않는다", !!earlyErr);

    const { error: notAdminErr } = await user.rpc(
        "admin_decide_refund_request",
        { p_id: reqId, p_approve: true },
    );
    check("고객은 스스로 승인할 수 없다", !!notAdminErr);

    // admin_decide_refund_request 는 aal2(2단계 인증)를 요구해 스크립트에서
    // 탈 수 없다. 집행 경로를 보기 위해 상태만 직접 올린다.
    await admin
        .from("refund_requests")
        .update({ status: "APPROVED", decided_at: new Date().toISOString() })
        .eq("id", reqId);

    const { data: done, error: doneErr } = await admin.rpc(
        "record_settlement_refund",
        { p_request_id: reqId },
    );
    check(
        "승인 후 집행된다",
        !doneErr && done?.already === false,
        doneErr?.message,
    );

    const { data: refundRow6 } = await admin
        .from("payments")
        .select(
            "gross_amount, commission_amount, payout_amount, discount_amount",
        )
        .eq("order_id", `${CODE_PREFIX}-ORD-6-S`)
        .single();
    check(
        "환불 행이 수수료율대로 음수 기록된다",
        refundRow6?.gross_amount === -12000 &&
            refundRow6?.commission_amount === -2400 &&
            refundRow6?.payout_amount === -9600,
        JSON.stringify(refundRow6),
    );

    const { data: adjust } = await admin
        .from("settlements")
        .select("amount, fee, net, reason")
        .eq(
            "payment_id",
            (
                await admin
                    .from("payments")
                    .select("id")
                    .eq("order_id", `${CODE_PREFIX}-ORD-6-S`)
                    .single()
            ).data.id,
        )
        .maybeSingle();
    check(
        "차감 정산이 생긴다",
        adjust?.amount === -12000 &&
            adjust?.net === -9600 &&
            adjust?.reason === "REFUND",
        JSON.stringify(adjust),
    );

    const { data: res6 } = await admin
        .from("reservations")
        .select("status")
        .eq("id", r6)
        .single();
    check(
        "미달분 환불은 예약을 취소하지 않는다",
        res6?.status !== "CANCELLED",
        `상태 ${res6?.status}`,
    );

    const { data: doneAgain } = await admin.rpc("record_settlement_refund", {
        p_request_id: reqId,
    });
    const { count: refundRows6 } = await admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("reservation_id", r6)
        .eq("type", "REFUND");
    check(
        "두 번 집행해도 한 번만 나간다",
        doneAgain?.already === true && refundRows6 === 1,
    );

    await admin.from("services").delete().eq("id", svc6.id);
    void pay6;

    console.log("\n▶ 포인트 원장");

    // memo 로 표시해 이 스크립트가 만든 행만 지운다.
    // user_id 로 지우면 화면 확인용으로 넣어둔 데이터까지 날아간다.
    const days = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

    await clearTestPoints(customerId);

    // 화면 확인용 포인트가 이미 있을 수 있으므로 절대값이 아니라 증가분으로 검증한다.
    const { data: baseline } = await admin.rpc("point_balance", {
        p_user_id: customerId,
    });

    await admin.from("points").insert([
        {
            user_id: customerId,
            amount: 400,
            reason: "EARN_PAYMENT",
            memo: POINT_MEMO,
        },
        { user_id: customerId, amount: -100, reason: "USE", memo: POINT_MEMO },
        // 만료됨 → 잔액에서 제외
        {
            user_id: customerId,
            amount: 500,
            reason: "COMPENSATION",
            expires_at: days(-1),
            memo: POINT_MEMO,
        },
        // 20일 뒤 만료 → 잔액 포함 + 소멸예정
        {
            user_id: customerId,
            amount: 200,
            reason: "EARN_PAYMENT",
            expires_at: days(20),
            memo: POINT_MEMO,
        },
        // 1년 뒤 만료 → 잔액 포함, 소멸예정 아님
        {
            user_id: customerId,
            amount: 1000,
            reason: "EARN_PAYMENT",
            expires_at: days(365),
            memo: POINT_MEMO,
        },
    ]);

    const { data: balance } = await admin.rpc("point_balance", {
        p_user_id: customerId,
    });
    const earned = balance - baseline;
    check(
        `point_balance() 만료분 제외 (증가분 ${earned}, 기대 1500)`,
        earned === 1500,
    );

    // 화면(app/(user)/mypage/_lib/points.server.ts)이 쓰는 것과 같은 규칙을 검증한다.
    const { data: ledger } = await user
        .from("points")
        .select("amount, expires_at")
        .eq("memo", POINT_MEMO);

    const now = Date.now();
    const soon = now + 30 * 86_400_000;
    const live = ledger.filter(
        (r) => !r.expires_at || new Date(r.expires_at).getTime() > now,
    );
    const uiBalance = live.reduce((s, r) => s + r.amount, 0);
    const uiExpiring = live
        .filter(
            (r) =>
                r.amount > 0 &&
                r.expires_at &&
                new Date(r.expires_at).getTime() <= soon,
        )
        .reduce((s, r) => s + r.amount, 0);

    check(
        `화면 잔액 규칙 = point_balance() (${uiBalance})`,
        uiBalance === earned,
    );
    check(`소멸예정 30일 이내만 집계 (실제 ${uiExpiring})`, uiExpiring === 200);

    console.log("\n▶ RLS 경계");

    const { data: mine } = await user
        .from("payments")
        .select("id")
        .eq("reservation_id", r1);
    check("본인 예약의 결제는 조회 가능", (mine?.length ?? 0) > 0);

    const { error: writeErr } = await user.from("payments").insert({
        reservation_id: r1,
        type: "BASE",
        order_id: `${CODE_PREFIX}-ORD-X`,
        gross_amount: 1,
        commission_amount: 0,
        payout_amount: 1,
    });
    check("고객은 결제 행을 만들 수 없음", !!writeErr);

    const { data: myPoints } = await user.from("points").select("id");
    check("본인 포인트는 조회 가능", (myPoints?.length ?? 0) > 0);

    const { error: pointWriteErr } = await user.from("points").insert({
        user_id: customerId,
        amount: 999_999,
        reason: "EARN_PAYMENT",
    });
    check("고객은 포인트를 스스로 적립할 수 없음", !!pointWriteErr);

    await user.auth.signOut();
    await clearTestPoints(customerId);
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

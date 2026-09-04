// 선결제 승인 라우트 검증 (#53) — 로컬 전용.
//
// 실행:
//   1) npx supabase start
//   2) npm run dev            (다른 터미널)
//   3) node --env-file=.env.local scripts/test-payment-api.mjs
//
// 안전장치:
//   - NEXT_PUBLIC_SUPABASE_URL 이 localhost/127.0.0.1 이 아니면 중단
//   - NICEPAY clientId 가 샌드박스(S1_/S2_)가 아니면 중단
//
// 무엇을 검증하는가:
//   app/api/payments/confirm 은 NICEPAY 가 POST 하는 지점이라 **로그인이 없다.**
//   즉 인터넷에 열린 엔드포인트이므로 거부 경로가 전부 막혀 있어야 한다.
//   시크릿 키가 있으니 유효한 signature 를 만들어 ① 을 통과시키고
//   ②③④ 와 보상 처리(⑦)까지 실제로 태운다.
//
//   승인 "성공" 경로는 결제창이 발급한 진짜 tid 가 있어야 해서 여기서 만들 수 없다.
//   그 경로는 Phase 2 에서 화면이 붙은 뒤 샌드박스 실거래로 확인한다.
//
// 멱등: code 가 TEST-53API 로 시작하는 예약만 만들고 끝나면 지운다.

import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const clientKey = process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY?.trim();
const secretKey = process.env.NICEPAY_SECRET_KEY?.trim();
const APP = process.env.APP_URL ?? "http://localhost:3000";

if (!url || !serviceKey) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
    process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error("❌ 로컬 스택이 아닙니다. 중단합니다.");
    process.exit(1);
}
if (!clientKey || !secretKey) {
    console.error("❌ NICEPAY 키가 필요합니다.");
    process.exit(1);
}
if (!/^S\d_/.test(clientKey)) {
    console.error("❌ 샌드박스 키가 아닙니다. 중단합니다.");
    process.exit(1);
}

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
    if (ok) {
        pass += 1;
        console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
    } else {
        fail += 1;
        console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` — ${detail}` : ""}`);
    }
}

/** NICEPAY 가 만드는 것과 같은 방식으로 signature 를 생성한다 */
function sign(authToken, amount) {
    return createHash("sha256")
        .update(`${authToken}${clientKey}${amount}${secretKey}`, "utf8")
        .digest("hex");
}

/** returnUrl 로 오는 것과 같은 form POST */
async function postConfirm(fields) {
    const body = new URLSearchParams(fields);
    const res = await fetch(`${APP}/api/payments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        redirect: "manual",
    });
    const location = res.headers.get("location") ?? "";
    const code = location ? new URL(location, APP).searchParams.get("code") : null;
    const pay = location ? new URL(location, APP).searchParams.get("pay") : null;
    return { status: res.status, location, code, pay };
}

// ---------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------
const CODE_PREFIX = "TEST-53API";
const made = { users: [], reservations: [] };

async function cleanup() {
    const { data: rows } = await admin
        .from("reservations")
        .select("id")
        .like("code", `${CODE_PREFIX}%`);

    for (const r of rows ?? []) {
        await admin.from("points").delete().eq("reservation_id", r.id);
        await admin.from("settlements").delete().eq("service_id", r.id);
        await admin.from("services").delete().eq("reservation_id", r.id);
        await admin.from("payments").delete().eq("reservation_id", r.id);
        await admin.from("reservation_applications").delete().eq("reservation_id", r.id);
        await admin.from("reservations").delete().eq("id", r.id);
    }
    for (const id of made.users) {
        await admin.from("profiles").delete().eq("id", id);
        await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    made.users = [];
}

async function makeUser(tag, role) {
    const email = `test53api-${tag}-${Date.now()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password: "test1234!",
        email_confirm: true,
    });
    if (error) throw error;
    made.users.push(data.user.id);
    await admin.from("profiles").upsert({
        id: data.user.id,
        name: `테스트${tag}`,
        email,
        role,
    });
    return data.user.id;
}

/** MATCHING + 파트너 선택 + PENDING 결제까지 만들어 둔다 */
async function makeScenario(suffix, { gross = 40000, discount = 0, deadlineMin = 30 } = {}) {
    const customer = await makeUser(`u${suffix}`, "USER");
    const partner = await makeUser(`p${suffix}`, "PARTNER");

    const { data: reservation, error } = await admin
        .from("reservations")
        .insert({
            code: `${CODE_PREFIX}-${suffix}`,
            customer_id: customer,
            status: "MATCHING",
            plan: "basic",
            patient_name: "환자",
            patient_birth: "1950-01-01",
            patient_gender: "male",
            patient_phone: "010-0000-0000",
            guardian_name: "보호자",
            guardian_phone: "010-1111-1111",
            relation: "자녀",
            treatment: "내과",
            purpose: "진료",
            use_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            arrive_time: "10:00",
            reserve_time: "10:30",
            duration: "2시간",
            depart_address: "서울특별시 강남구 역삼동 1",
            hospital_address: "서울특별시 종로구 2",
            duration_minutes: 120,
            prepaid_amount: gross,
            confirmed_partner_id: partner,
            payment_deadline: new Date(Date.now() + deadlineMin * 60000).toISOString(),
        })
        .select("id, code")
        .single();
    if (error) throw error;

    await admin.from("reservation_applications").insert({
        reservation_id: reservation.id,
        partner_id: partner,
        status: "ACCEPTED",
    });

    const orderId = `${reservation.code}-${Date.now().toString(36)}`;
    const commission = Math.round(gross * 0.2) - discount;

    const { data: payment, error: payErr } = await admin
        .from("payments")
        .insert({
            reservation_id: reservation.id,
            type: "BASE",
            status: "PENDING",
            order_id: orderId,
            gross_amount: gross,
            discount_amount: discount,
            commission_amount: commission,
            payout_amount: gross - discount - commission,
        })
        .select("id")
        .single();
    if (payErr) throw payErr;

    if (discount > 0) {
        await admin.from("points").insert({
            user_id: customer,
            amount: discount,
            reason: "COMPENSATION",
            memo: "TEST-53API",
        });
        const { error: spendErr } = await admin.rpc("spend_points", {
            p_payment_id: payment.id,
            p_amount: discount,
        });
        if (spendErr) throw spendErr;
    }

    return { customer, partner, reservation, orderId, paymentId: payment.id, gross, discount };
}

async function paymentStatus(id) {
    const { data } = await admin.from("payments").select("status").eq("id", id).single();
    return data?.status;
}

async function balance(userId) {
    const { data } = await admin.rpc("point_balance", { p_user_id: userId });
    return data ?? 0;
}

// ---------------------------------------------------------------
// 실행
// ---------------------------------------------------------------
console.log(`\n승인 라우트 검증 — ${APP}\n`);

// 서버가 떠 있는지
try {
    const ping = await fetch(`${APP}/api/payments/status?orderId=ping`, {
        redirect: "manual",
    });
    if (ping.status === 0) throw new Error("no response");
} catch {
    console.error(`❌ ${APP} 에 연결할 수 없습니다. 다른 터미널에서 npm run dev 를 실행하세요.`);
    process.exit(1);
}

await cleanup();

try {
    // ---------- 인증 실패 (사용자가 결제창을 닫음) ----------
    console.log("[1] 결제창 인증 실패 — 돈이 나가지 않는다");
    {
        const s = await makeScenario("authfail");
        const r = await postConfirm({
            authResultCode: "9999",
            authResultMsg: "사용자 취소",
            orderId: s.orderId,
        });
        check("실패로 리다이렉트된다", r.pay === "fail", `pay=${r.pay}`);
        check("PENDING 결제가 FAILED 로 정리된다", (await paymentStatus(s.paymentId)) === "FAILED");
    }

    // ---------- signature 위조 ----------
    console.log("\n[2] signature 검증");
    {
        const s = await makeScenario("badsig");
        const r = await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-1",
            orderId: s.orderId,
            amount: String(s.gross),
            authToken: "tok",
            signature: "deadbeef".repeat(8),
        });
        check("위조 signature 를 거부한다", r.code === "INVALID_SIGNATURE", `code=${r.code}`);
        check("결제가 FAILED 로 정리된다", (await paymentStatus(s.paymentId)) === "FAILED");
    }

    {
        const s = await makeScenario("nosig");
        const r = await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-2",
            orderId: s.orderId,
            amount: String(s.gross),
        });
        check("signature 누락을 거부한다", r.code === "INVALID_SIGNATURE", `code=${r.code}`);
    }

    // ---------- 알 수 없는 주문번호 ----------
    console.log("\n[3] 주문번호 검증");
    {
        const token = "tok-unknown";
        const amount = 40000;
        const r = await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-3",
            orderId: "NOT-OURS-999",
            amount: String(amount),
            authToken: token,
            signature: sign(token, amount),
        });
        check("우리가 만들지 않은 주문을 거부한다", r.code === "UNKNOWN_ORDER", `code=${r.code}`);
    }

    // ---------- 금액 위변조 ----------
    console.log("\n[4] 금액 대조 — signature 는 유효하지만 금액이 다르다");
    {
        const s = await makeScenario("amount");
        const token = "tok-amount";
        const tampered = 1000; // 4만원짜리를 천원으로
        const r = await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-4",
            orderId: s.orderId,
            amount: String(tampered),
            authToken: token,
            signature: sign(token, tampered), // 서명 자체는 정상
        });
        check("금액이 다르면 승인하지 않는다", r.code === "AMOUNT_MISMATCH", `code=${r.code}`);
        check("결제가 FAILED 로 정리된다", (await paymentStatus(s.paymentId)) === "FAILED");
    }

    // ---------- 결제 기한 만료 ----------
    console.log("\n[5] 승인 직전 만료 재확인");
    {
        const s = await makeScenario("expired", { deadlineMin: -1 });
        const token = "tok-expired";
        const r = await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-5",
            orderId: s.orderId,
            amount: String(s.gross),
            authToken: token,
            signature: sign(token, s.gross),
        });
        check("기한이 지났으면 승인하지 않는다", r.code === "PAYMENT_EXPIRED", `code=${r.code}`);
        check("결제가 FAILED 로 정리된다", (await paymentStatus(s.paymentId)) === "FAILED");
    }

    // ---------- 파트너 선택 해제 ----------
    console.log("\n[6] 승인 직전 재선택 확인");
    {
        const s = await makeScenario("released");
        await admin
            .from("reservations")
            .update({ confirmed_partner_id: null })
            .eq("id", s.reservation.id);

        const token = "tok-released";
        const r = await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-6",
            orderId: s.orderId,
            amount: String(s.gross),
            authToken: token,
            signature: sign(token, s.gross),
        });
        check("선택이 풀렸으면 승인하지 않는다", r.code === "PAYMENT_EXPIRED", `code=${r.code}`);
    }

    // ---------- PG 승인 실패 시 포인트 복원 ----------
    console.log("\n[7] 승인 실패 시 보상 — 포인트가 복원된다");
    {
        const s = await makeScenario("points", { discount: 5000 });

        const afterSpend = await balance(s.customer);
        check("선점으로 잔액이 0 이 됐다", afterSpend === 0, `잔액=${afterSpend}`);

        const token = "tok-points";
        const charge = s.gross - s.discount;
        const r = await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-7", // 실제 PG 에서 U120 으로 거절된다
            orderId: s.orderId,
            amount: String(charge),
            authToken: token,
            signature: sign(token, charge),
        });

        check("PG 승인이 실패한다", r.pay === "fail", `code=${r.code}`);
        check("결제가 FAILED 로 정리된다", (await paymentStatus(s.paymentId)) === "FAILED");

        const restored = await balance(s.customer);
        check("포인트 5000 이 복원된다", restored === 5000, `잔액=${restored}`);
    }

    // ---------- 이미 PAID 인 결제 재전송 ----------
    console.log("\n[8] 중복 전송 — 이미 승인된 결제");
    {
        const s = await makeScenario("dup");
        await admin
            .from("payments")
            .update({ status: "PAID", transaction_id: "already-paid-tid" })
            .eq("id", s.paymentId);

        const token = "tok-dup";
        const r = await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-8",
            orderId: s.orderId,
            amount: String(s.gross),
            authToken: token,
            signature: sign(token, s.gross),
        });

        check("성공 화면으로 보낸다", r.pay === "done", `pay=${r.pay}`);
        check("PAID 상태가 유지된다", (await paymentStatus(s.paymentId)) === "PAID");
    }

    // ---------- 로그인 없이 prepare/status ----------
    console.log("\n[9] 인증이 필요한 라우트");
    {
        const prep = await fetch(`${APP}/api/payments/prepare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reservationId: "00000000-0000-0000-0000-000000000000" }),
        });
        check("비로그인 prepare 는 401", prep.status === 401, `HTTP ${prep.status}`);

        const st = await fetch(`${APP}/api/payments/status?orderId=whatever`);
        check("비로그인 status 는 401", st.status === 401, `HTTP ${st.status}`);
    }
} finally {
    await cleanup();
    const { data: leftover } = await admin
        .from("reservations")
        .select("id")
        .like("code", `${CODE_PREFIX}%`);
    console.log(`\n정리 — TEST 예약 잔여 | ${leftover?.length ?? 0}`);
}

console.log(`\n\x1b[1m${pass}건 통과 / ${fail}건 실패\x1b[0m\n`);
process.exit(fail > 0 ? 1 : 0);

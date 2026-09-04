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

/**
 * 로그인 세션 쿠키를 만든다.
 *
 *  @supabase/ssr 은 세션을 `sb-<hostname 첫 조각>-auth-token` 쿠키에
 *  `base64-` + base64url(JSON) 로 저장한다. 3180byte 를 넘으면 `.0` `.1` 로 쪼갠다.
 *  라우트의 소유권·상태 검증을 태우려면 실제 세션이 필요해서 직접 만든다.
 */
const COOKIE_NAME = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
const CHUNK = 3180;

async function loginCookie(email, password) {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signInWithPassword({
        email,
        password,
    });
    if (error) throw error;

    const encoded =
        "base64-" +
        Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");

    if (encoded.length <= CHUNK) return `${COOKIE_NAME}=${encoded}`;

    const parts = [];
    for (let i = 0; i * CHUNK < encoded.length; i += 1) {
        parts.push(
            `${COOKIE_NAME}.${i}=${encoded.slice(i * CHUNK, (i + 1) * CHUNK)}`,
        );
    }
    return parts.join("; ");
}

async function postPrepare(cookie, body) {
    const res = await fetch(`${APP}/api/payments/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
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
    const q = location ? new URL(location, APP).searchParams : null;
    const path = location ? new URL(location, APP).pathname : "";
    return {
        status: res.status,
        location,
        path,
        code: q?.get("code") ?? null,
        pay: q?.get("pay") ?? null,
        // 결제창을 거치며 클라이언트 스토어가 날아가므로 rid 로 복원한다 (#54)
        rid: q?.get("rid") ?? null,
    };
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

    // 사고 원장은 예약과 무관한 행(UNKNOWN_ORDER)도 있어 order_id 로 따로 지운다.
    // 섹션 [3] 이 쓰는 NOT-OURS- 주문번호도 함께 정리한다.
    for (const prefix of [`${CODE_PREFIX}%`, "NOT-OURS-%"]) {
        await admin
            .from("payment_incidents")
            .delete()
            .like("order_id", prefix);
    }

    for (const r of rows ?? []) {
        await admin.from("payment_incidents").delete().eq("reservation_id", r.id);
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
    return { id: data.user.id, email, password: "test1234!" };
}

/** MATCHING + 파트너 선택 + PENDING 결제까지 만들어 둔다 */
async function makeScenario(
    suffix,
    { gross = 40000, discount = 0, deadlineMin = 30, selectPartner = true } = {},
) {
    const customer = await makeUser(`u${suffix}`, "USER");
    const partner = await makeUser(`p${suffix}`, "PARTNER");

    const { data: reservation, error } = await admin
        .from("reservations")
        .insert({
            code: `${CODE_PREFIX}-${suffix}`,
            customer_id: customer.id,
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
            confirmed_partner_id: selectPartner ? partner.id : null,
            payment_deadline: selectPartner
                ? new Date(Date.now() + deadlineMin * 60000).toISOString()
                : null,
        })
        .select("id, code")
        .single();
    if (error) throw error;

    await admin.from("reservation_applications").insert({
        reservation_id: reservation.id,
        partner_id: partner.id,
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
            user_id: customer.id,
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

    return {
        customer,
        partner,
        reservation,
        orderId,
        paymentId: payment.id,
        gross,
        discount,
    };
}

/** 포인트를 지급한다(선점하지 않음) */
async function grantPoints(userId, amount) {
    await admin.from("points").insert({
        user_id: userId,
        amount,
        reason: "COMPENSATION",
        memo: "TEST-53API",
    });
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
        check(
            "실패해도 rid 를 실어 결제 화면으로 되돌린다",
            r.rid === s.reservation.id,
            `rid=${r.rid}`,
        );
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

        const afterSpend = await balance(s.customer.id);
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

        const restored = await balance(s.customer.id);
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
        check(
            "예약 플로우로 되돌린다 (#54 복원)",
            r.path === "/reservation",
            `path=${r.path}`,
        );
        check(
            "복원용 rid 를 함께 싣는다",
            r.rid === s.reservation.id,
            `rid=${r.rid}`,
        );
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

    // ---------- prepare 소유권·상태 검증 ----------
    console.log("\n[10] prepare — 소유권과 상태");
    {
        const mine = await makeScenario("prep-mine");
        const other = await makeScenario("prep-other");

        const cookie = await loginCookie(
            mine.customer.email,
            mine.customer.password,
        );

        // 세션이 실제로 먹는지 먼저 확인한다. 여기서 401 이면 아래 검증이 무의미하다.
        const own = await postPrepare(cookie, {
            reservationId: mine.reservation.id,
            pointsToUse: 0,
        });
        check(
            "세션 쿠키가 인식된다 (401 이 아님)",
            own.status !== 401,
            `HTTP ${own.status}`,
        );

        const foreign = await postPrepare(cookie, {
            reservationId: other.reservation.id,
            pointsToUse: 0,
        });
        check(
            "남의 예약은 404 — 존재 여부를 알려주지 않는다",
            foreign.status === 404,
            `HTTP ${foreign.status}`,
        );
    }

    {
        // 파트너 미선택 상태
        const s = await makeScenario("prep-nopartner", { selectPartner: false });
        const cookie = await loginCookie(s.customer.email, s.customer.password);
        const r = await postPrepare(cookie, {
            reservationId: s.reservation.id,
            pointsToUse: 0,
        });
        check(
            "파트너 미선택이면 거절한다",
            r.json?.code === "PARTNER_NOT_SELECTED",
            `code=${r.json?.code} HTTP ${r.status}`,
        );
    }

    {
        // 기한 만료
        const s = await makeScenario("prep-expired", { deadlineMin: -1 });
        const cookie = await loginCookie(s.customer.email, s.customer.password);
        const r = await postPrepare(cookie, {
            reservationId: s.reservation.id,
            pointsToUse: 0,
        });
        check(
            "결제 기한이 지났으면 거절한다",
            r.json?.code === "PAYMENT_EXPIRED",
            `code=${r.json?.code}`,
        );
    }

    // ---------- prepare 정상 경로 + 포인트 ----------
    console.log("\n[11] prepare — 금액과 포인트");
    {
        const s = await makeScenario("prep-ok");
        const cookie = await loginCookie(s.customer.email, s.customer.password);

        const r = await postPrepare(cookie, {
            reservationId: s.reservation.id,
            pointsToUse: 0,
        });

        check("주문번호를 발급한다", typeof r.json?.orderId === "string");
        check(
            "결제 금액이 예약의 선결제액과 같다",
            r.json?.amount === s.gross,
            `amount=${r.json?.amount} gross=${s.gross}`,
        );
        check(
            "clientId 를 함께 내려준다",
            typeof r.json?.clientId === "string" && r.json.clientId.length > 0,
        );

        // 결제 기한이 +10분으로 연장됐는지
        const { data: after } = await admin
            .from("reservations")
            .select("payment_deadline")
            .eq("id", s.reservation.id)
            .single();
        const left =
            new Date(after.payment_deadline).getTime() - Date.now();
        check(
            "결제창 진입으로 기한이 연장된다",
            left > 9.5 * 60000,
            `남은 ${Math.round(left / 1000)}초`,
        );

        // 새 PENDING 결제가 생기고 기존 것은 접힌다
        const { data: pays } = await admin
            .from("payments")
            .select("status")
            .eq("reservation_id", s.reservation.id);
        const pending = (pays ?? []).filter((p) => p.status === "PENDING");
        check(
            "PENDING 결제는 하나만 남는다",
            pending.length === 1,
            `PENDING ${pending.length}건 / 전체 ${pays?.length}건`,
        );
    }

    {
        const s = await makeScenario("prep-points");
        const cookie = await loginCookie(s.customer.email, s.customer.password);

        // 잔액보다 많이 쓰려 하면 거절
        await grantPoints(s.customer.id, 3000);
        const over = await postPrepare(cookie, {
            reservationId: s.reservation.id,
            pointsToUse: 9000,
        });
        check(
            "잔액을 넘는 포인트는 거절한다",
            over.json?.code === "INSUFFICIENT_POINTS",
            `code=${over.json?.code}`,
        );

        // 잔액 범위면 통과하고 승인 요청액에서 빠진다
        const ok = await postPrepare(cookie, {
            reservationId: s.reservation.id,
            pointsToUse: 3000,
        });
        check(
            "포인트만큼 승인 요청액이 줄어든다",
            ok.json?.amount === s.gross - 3000,
            `amount=${ok.json?.amount}`,
        );
        check(
            "총액은 그대로 보고된다",
            ok.json?.grossAmount === s.gross,
            `gross=${ok.json?.grossAmount}`,
        );

        const bal = await balance(s.customer.id);
        check("포인트가 선점되어 잔액이 0 이 된다", bal === 0, `잔액=${bal}`);

        // 다시 준비하면 이전 선점이 풀리고 새로 잡힌다
        const again = await postPrepare(cookie, {
            reservationId: s.reservation.id,
            pointsToUse: 1000,
        });
        check(
            "재시도 시 금액이 새 포인트로 계산된다",
            again.json?.amount === s.gross - 1000,
            `amount=${again.json?.amount}`,
        );
        const bal2 = await balance(s.customer.id);
        check(
            "이전 선점이 복원되어 잔액이 2000 이 된다",
            bal2 === 2000,
            `잔액=${bal2}`,
        );
    }

    // ---------- 결제 사고 적재 (#79) ----------
    // 사고는 "돈이 어긋난 상황" 이므로 기록이 남지 않으면 아무도 모른다.
    // 여기서는 승인 라우트가 실제로 적재하는지를 본다.
    console.log("\n[12] 결제 사고 적재");
    {
        // 알 수 없는 주문번호로 승인 시도 → UNKNOWN_ORDER
        const token = "tok-incident";
        const bogusOrder = `${CODE_PREFIX}-BOGUS-${Date.now()}`;
        await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-incident",
            orderId: bogusOrder,
            amount: "40000",
            authToken: token,
            signature: sign(token, 40000),
        });

        const { data: unknown } = await admin
            .from("payment_incidents")
            .select("kind, severity, status, order_id, amount")
            .eq("order_id", bogusOrder)
            .maybeSingle();

        check(
            "알 수 없는 주문 승인 시도가 적재된다",
            unknown?.kind === "UNKNOWN_ORDER",
            `kind=${unknown?.kind}`,
        );
        check("심각도 MEDIUM 으로 기록된다", unknown?.severity === "MEDIUM");
        check("OPEN 상태로 시작한다", unknown?.status === "OPEN");

        // 금액 위조 → AMOUNT_MISMATCH (서명은 유효)
        const s = await makeScenario("incident-amount");
        const t2 = "tok-amt";
        await postConfirm({
            authResultCode: "0000",
            tid: "fake-tid-amt",
            orderId: s.orderId,
            amount: "1000",
            authToken: t2,
            signature: sign(t2, 1000),
        });

        const { data: mismatch } = await admin
            .from("payment_incidents")
            .select("kind, severity, amount, detail, reservation_id")
            .eq("order_id", s.orderId)
            .eq("kind", "AMOUNT_MISMATCH")
            .maybeSingle();

        check(
            "금액 위조가 적재된다",
            mismatch?.kind === "AMOUNT_MISMATCH",
            `kind=${mismatch?.kind}`,
        );
        check("심각도 HIGH 로 기록된다", mismatch?.severity === "HIGH");
        check(
            "요청 금액과 기대 금액이 detail 에 남는다",
            mismatch?.detail?.requested === 1000 &&
                mismatch?.detail?.expected === s.gross,
            JSON.stringify(mismatch?.detail),
        );
        check(
            "예약과 연결된다 (관리자 화면에서 건을 지목할 수 있어야 함)",
            mismatch?.reservation_id === s.reservation.id,
        );

        // 개인정보가 새지 않는지 — detail 은 조치용 값만 담아야 한다
        const { data: all } = await admin
            .from("payment_incidents")
            .select("detail")
            .like("order_id", `${CODE_PREFIX}%`);
        const leaked = (all ?? []).filter((r) => {
            const s = JSON.stringify(r.detail ?? {});
            return /환자|보호자|010-|patient|guardian/.test(s);
        });
        check(
            "detail 에 개인정보가 담기지 않는다",
            leaked.length === 0,
            `${leaked.length}건에서 발견`,
        );

        // 일반 사용자는 사고 원장을 볼 수 없어야 한다
        const cookieUser = await makeUser("incident-peek", "USER");
        const anonC = createClient(
            url,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } },
        );
        await anonC.auth.signInWithPassword({
            email: cookieUser.email,
            password: cookieUser.password,
        });
        const peek = await anonC.from("payment_incidents").select("id");
        check(
            "일반 사용자는 사고 원장을 조회할 수 없다",
            (peek.data ?? []).length === 0,
            `${(peek.data ?? []).length}건 보임`,
        );
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

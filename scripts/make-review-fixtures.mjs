// PG 심사용 화면 만들기 (#81) — 심사자가 직접 열어 볼 수 있는 상태를 준비한다.
//
// NICEPAY 가 요청한 것
//   "심사 시에는 당사에서 확인 가능하도록 예약금 결제 페이지와,
//    테스트용 링크결제 URL 전달주시면 심사가 가능합니다."
//
// 왜 스크립트가 필요한가
//   두 화면 다 **홈페이지에서 도달할 수 없다.**
//     · 예약금 결제 페이지 — 로그인 → 예약 작성 → 파트너 수락 → 파트너 선택을
//       거쳐야 나온다. 심사자 혼자서는 "파트너 수락" 을 넘을 수 없다.
//     · 링크결제 URL — 토큰이 발급돼 있어야 하고 메일로만 전달된다.
//   그래서 심사자가 로그인만 하면 결제 화면까지 갈 수 있는 상태를 미리 만든다.
//
// 실행
//   로컬   node --env-file=.env.local scripts/make-review-fixtures.mjs
//   운영   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//            node scripts/make-review-fixtures.mjs --prod
//   정리   ... scripts/make-review-fixtures.mjs --prod --cleanup
//
//   ⚠️ 운영 키를 파일에 적어 두지 않는다. 위처럼 그 실행에만 넘긴다.
//
// 안전장치
//   다른 테스트 스크립트는 **로컬이 아니면 중단**한다. 이 스크립트는 반대로
//   운영에 써야 하므로, 로컬이 아닐 때 `--prod` 를 요구한다. 실수로 운영에
//   쓰는 것과, 운영인 줄 모르고 쓰는 것을 둘 다 막는다.
//
// 뒷정리
//   만든 것에 전부 REVIEW 표식을 붙인다. --cleanup 이 그것만 지운다.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = new Set(process.argv.slice(2));
const cleanupOnly = args.has("--cleanup");
const prodAck = args.has("--prod");

if (!url || !serviceKey) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
    process.exit(1);
}

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
const host = new URL(url).host;

if (!isLocal && !prodAck) {
    console.error(`❌ 로컬이 아닌 데이터베이스입니다 : ${host}`);
    console.error("   운영에 만들려면 --prod 를 붙여 다시 실행하세요.");
    console.error("   (다른 테스트 스크립트와 반대입니다 — 이 스크립트는 운영용입니다)");
    process.exit(1);
}

/**
 * 안내에 적을 주소.
 *
 *  DB 가 로컬인데 운영 주소를 적으면 심사자에게 **다른 DB 의 화면**을
 *  안내하게 된다. 명시된 값이 없으면 DB 를 따라간다.
 */
const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (isLocal ? "http://localhost:3000" : "https://www.hamkegayo.kr")
).replace(/\/$/, "");

console.log(`\n대상 : ${host} ${isLocal ? "(로컬)" : "\x1b[33m(운영)\x1b[0m"}`);
console.log(`안내 주소 : ${siteUrl}`);

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------
// 표식 — 이 스크립트가 만든 것만 지우기 위한 것
// ---------------------------------------------------------------
const CODE_PREFIX = "REVIEW";
const MEMBER_EMAIL = "nicepay-review@hamkegayo.kr";
const MEMBER_PASSWORD = "Review2026!";
const PARTNER_LOGIN = "reviewpartner";
const PARTNER_EMAIL = `${PARTNER_LOGIN}@partner.hamkegayo.internal`;
const PARTNER_PASSWORD = "Review2026!";

/** 이용일 — 오늘로부터 7일 뒤 평일. 주말 할증을 피해 금액을 단순하게 둔다. */
function reviewUseDate() {
    const at = new Date(Date.now() + 7 * 86_400_000);
    // KST 기준 날짜로 맞춘다 (서버가 UTC 로 돌 수 있다).
    const ymd = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(at);
    const [y, m, d] = ymd.split("-").map(Number);
    // 토(6)·일(0)이면 월요일로 민다.
    const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const shift = day === 6 ? 2 : day === 0 ? 1 : 0;
    const moved = new Date(Date.UTC(y, m - 1, d + shift));
    return moved.toISOString().slice(0, 10);
}

async function findUser(email) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    return data?.users?.find((u) => u.email === email) ?? null;
}

async function cleanup() {
    await admin.from("reservations").delete().like("code", `${CODE_PREFIX}%`);
    for (const email of [MEMBER_EMAIL, PARTNER_EMAIL]) {
        const u = await findUser(email);
        if (u) await admin.auth.admin.deleteUser(u.id);
    }
}

/** 계정 하나 — 있으면 비밀번호만 맞추고 없으면 만든다 */
async function ensureAccount({ email, password, role, name, phone }) {
    let user = await findUser(email);
    if (user) {
        await admin.auth.admin.updateUserById(user.id, { password });
    } else {
        const { data, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        });
        if (error) throw error;
        user = data.user;
    }

    await admin.from("profiles").upsert({
        id: user.id,
        role,
        name,
        phone,
        email: role === "PARTNER" ? null : email,
        status: "ACTIVE",
    });

    return user.id;
}

/** 예약 한 건. 심사용이라 환자 정보는 전부 가짜다. */
async function makeReservation({ code, customerId, status, useDate }) {
    const { data, error } = await admin
        .from("reservations")
        .insert({
            code,
            customer_id: customerId,
            status,
            plan: "basic",
            patient_name: "심사테스트",
            patient_birth: "1960-01-01",
            patient_gender: "male",
            patient_phone: "010-0000-0000",
            guardian_name: "심사보호자",
            guardian_phone: "010-0000-0000",
            relation: "본인",
            treatment: "내과",
            purpose: "정기 진료",
            use_date: useDate,
            arrive_time: "10시 00분",
            reserve_time: "10시 30분",
            duration: "2시간",
            duration_minutes: 120,
            depart_address: "강원특별자치도 원주시 남산로 77",
            hospital_address: "강원특별자치도 원주시 일산로 20",
            hospital_name: "심사용 병원",
            hourly_rate: 20000,
            fee_rate: 0.2,
            surcharge_rate: 0,
            prepaid_amount: 40000,
        })
        .select("id, code")
        .single();
    if (error) throw error;
    return data;
}

async function main() {
    // 반복 실행해도 같은 결과가 나오도록 먼저 지운다.
    await cleanup();
    if (cleanupOnly) {
        console.log("\n🧹 심사용 데이터를 모두 지웠습니다.\n");
        return;
    }

    const useDate = reviewUseDate();

    // ---------- 계정 ----------
    const memberId = await ensureAccount({
        email: MEMBER_EMAIL,
        password: MEMBER_PASSWORD,
        role: "USER",
        name: "심사담당자",
        phone: "010-0000-0000",
    });

    const partnerId = await ensureAccount({
        email: PARTNER_EMAIL,
        password: PARTNER_PASSWORD,
        role: "PARTNER",
        name: "심사용파트너",
        phone: "010-0000-0000",
    });
    await admin
        .from("partner_accounts")
        .upsert({ profile_id: partnerId, login_id: PARTNER_LOGIN });

    // ---------- ① 예약금 결제 페이지용 ----------
    //  MATCHING 상태 + 파트너의 ACCEPTED 지원.
    //  심사자가 로그인해 파트너를 고르면 결제 단계(STEP7)로 넘어간다.
    const matching = await makeReservation({
        code: `${CODE_PREFIX}-PREPAY`,
        customerId: memberId,
        status: "MATCHING",
        useDate,
    });

    const { error: appErr } = await admin
        .from("reservation_applications")
        .insert({
            reservation_id: matching.id,
            partner_id: partnerId,
            status: "ACCEPTED",
        });
    if (appErr) throw appErr;

    // ---------- ② 링크결제 URL 용 ----------
    //  추가결제(연장) 건을 하나 만들고 토큰을 발급한다. 링크는 비로그인으로
    //  열리고 환자 정보가 표시되지 않는다.
    const linkRes = await makeReservation({
        code: `${CODE_PREFIX}-LINK`,
        customerId: memberId,
        status: "COMPLETED",
        useDate,
    });

    const token = randomBytes(32).toString("base64url");
    const orderId = `${linkRes.code}-${Date.now().toString(36)}`;
    const expires = new Date(Date.now() + 3 * 86_400_000).toISOString();

    const { data: charge, error: chargeErr } = await admin.rpc(
        "create_extension_payment",
        {
            p_reservation_id: linkRes.id,
            p_amount: 5000,
            p_reason: "EXTENSION",
            p_order_id: orderId,
            p_token: token,
            p_token_expires: expires,
            // 소프트 상한에 걸리면 링크가 발송 보류 상태가 된다. 심사용은 넘긴다.
            p_review_threshold: 10_000_000,
        },
    );
    if (chargeErr) throw chargeErr;

    // 링크를 실제로 보낸 것으로 표시해야 발송 대기로 보이지 않는다.
    await admin
        .from("payments")
        .update({ link_sent_at: new Date().toISOString() })
        .eq("id", charge.payment_id);

    // ---------------------------------------------------------------
    // 결과 — 그대로 옮겨 보낼 수 있게 적는다
    // ---------------------------------------------------------------
    const line = "─".repeat(64);
    console.log(`\n${line}`);
    console.log("NICEPAY 심사용 안내 (아래 내용을 그대로 전달하시면 됩니다)");
    console.log(line);

    console.log(`
■ 심사용 로그인 계정
   주소     : ${siteUrl}/login  (일반 회원 탭)
   이메일   : ${MEMBER_EMAIL}
   비밀번호 : ${MEMBER_PASSWORD}

■ ① 예약금(선결제) 결제 페이지
   1) 위 계정으로 로그인
   2) ${siteUrl}/mypage/reservations/${matching.id}
   3) 수락한 파트너를 선택하면 결제 화면으로 넘어갑니다
   ※ 파트너 선택 후 30분 안에 결제해야 합니다. 시간이 지나면
      같은 화면에서 파트너를 다시 선택하면 됩니다.

■ ② 테스트용 링크결제 URL  (로그인 불필요)
   ${siteUrl}/pay/${token}
   금액 5,000원 · 유효기간 3일 (${expires.slice(0, 10)} 까지)

■ 참고
   · 현재 테스트(샌드박스) 키로 연동되어 있어 실제 청구는 발생하지 않습니다.
   · 사업자정보 · 이용약관 · 취소·환불 정책은 모든 결제 화면 하단에 있습니다.
     ${siteUrl}/refund-policy
`);

    console.log(line);
    console.log("심사가 끝나면 아래로 정리하세요.");
    console.log(
        `  ${isLocal ? "node --env-file=.env.local" : "NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node"} scripts/make-review-fixtures.mjs${isLocal ? "" : " --prod"} --cleanup`,
    );
    console.log(`${line}\n`);
}

main().catch(async (e) => {
    console.error("\n💥 실패 :", e.message ?? e);
    process.exit(1);
});

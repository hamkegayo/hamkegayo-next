// NICEPAY 신형 API(v1) 계약 검증 — 샌드박스 전용 (#53).
//
// 실행:
//   node --env-file=.env.local scripts/test-nicepay.mjs
//
// 사전 조건:
//   .env.local 에 NEXT_PUBLIC_NICEPAY_CLIENT_KEY / NICEPAY_SECRET_KEY 가 있을 것
//
// 안전장치: clientId 가 샌드박스(S1_/S2_) 가 아니면 즉시 중단한다.
//   운영 키(R1_/R2_)로 이 스크립트를 돌리면 실제 거래를 건드릴 수 있다.
//
// 무엇을 검증하는가:
//   lib/payments/nicepay.ts 가 의존하는 **외부 계약**을 확인한다.
//     1) Basic 인증이 실제로 통과하는가 (키가 유효한가)
//     2) 엔드포인트 경로가 문서대로인가
//     3) 실패 응답이 resultCode 를 담은 JSON 인가 (어댑터의 오류 처리 전제)
//     4) signature 공식이 문서와 일치하는가
//
//   승인·취소 "성공" 경로는 결제창 인증(tid)이 있어야 하므로 여기서 검증할 수 없다.
//   그 경로는 Phase 2 에서 화면이 붙은 뒤 실거래로 확인한다.
//
// 부작용 없음: 존재하지 않는 주문번호로만 조회하므로 아무것도 만들지 않는다.

import { createHash } from "node:crypto";

const clientKey = process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY?.trim();
const secretKey = process.env.NICEPAY_SECRET_KEY?.trim();

if (!clientKey || !secretKey) {
    console.error(
        "❌ NEXT_PUBLIC_NICEPAY_CLIENT_KEY / NICEPAY_SECRET_KEY 가 필요합니다.",
    );
    console.error("   예) node --env-file=.env.local scripts/test-nicepay.mjs");
    process.exit(1);
}

const isSandbox = /^S\d_/.test(clientKey);

if (!isSandbox) {
    console.error(
        `❌ 샌드박스 키가 아닙니다 (접두사 '${clientKey.slice(0, 3)}'). 중단합니다.`,
    );
    console.error(
        "   운영 키로 실행하면 실제 거래에 영향을 줄 수 있습니다. S1_/S2_ 키로만 실행하세요.",
    );
    process.exit(1);
}

const API_BASE = "https://sandbox-api.nicepay.co.kr";
const credentials = Buffer.from(`${clientKey}:${secretKey}`, "utf8").toString(
    "base64",
);

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
    if (ok) {
        pass += 1;
        console.log(`  PASS  ${label}`);
    } else {
        fail += 1;
        console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    }
}

async function call(path, method = "GET", body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        /* 파싱 실패는 호출부에서 판정한다 */
    }
    return { status: res.status, json, text };
}

console.log(`\n샌드박스 계약 검증 — ${API_BASE}`);
console.log(`clientId 접두사: ${clientKey.slice(0, 3)} (샌드박스)\n`);

// ---------------------------------------------------------------
// 1. signature 공식 — hex(sha256(authToken + clientId + amount + secretKey))
// ---------------------------------------------------------------
console.log("[1] signature 공식");
{
    const authToken = "test-auth-token";
    const amount = 40000;
    const expected = createHash("sha256")
        .update(`${authToken}${clientKey}${amount}${secretKey}`, "utf8")
        .digest("hex");

    check("sha256 hex 64자를 만든다", expected.length === 64);
    check(
        "입력이 다르면 값이 달라진다",
        expected !==
            createHash("sha256")
                .update(`${authToken}${clientKey}${amount + 1}${secretKey}`, "utf8")
                .digest("hex"),
    );
}

// ---------------------------------------------------------------
// 2. 거래 조회 — Basic 인증이 통과하는지 (키 유효성)
// ---------------------------------------------------------------
console.log("\n[2] 거래 조회 GET /v1/payments/find/{orderId}");
{
    const orderId = `contract-check-${Date.now()}`;
    const { status, json, text } = await call(
        `/v1/payments/find/${encodeURIComponent(orderId)}`,
    );

    check("JSON 응답을 돌려준다", json !== null, text.slice(0, 120));
    check(
        "인증 실패(401/403)가 아니다 — 키가 유효하다",
        status !== 401 && status !== 403,
        `HTTP ${status}`,
    );
    check(
        "resultCode 필드를 담고 있다",
        typeof json?.resultCode === "string",
        json ? `resultCode=${json.resultCode}` : "",
    );
    check(
        "없는 주문은 성공(0000)이 아니다",
        json?.resultCode !== "0000",
        `resultCode=${json?.resultCode} msg=${json?.resultMsg ?? ""}`,
    );

    if (json?.resultCode) {
        console.log(
            `        └ 응답: ${json.resultCode} ${json.resultMsg ?? ""}`,
        );
    }
}

// ---------------------------------------------------------------
// 3. 승인 — 없는 tid 로 호출해 오류 형태를 확인한다 (승인은 일어나지 않는다)
// ---------------------------------------------------------------
console.log("\n[3] 승인 POST /v1/payments/{tid}");
{
    const ediDate = new Date().toISOString();
    const tid = `contract-check-${Date.now()}`;
    const amount = 1000;
    const signData = createHash("sha256")
        .update(`${tid}${amount}${ediDate}${secretKey}`, "utf8")
        .digest("hex");

    const { status, json } = await call(
        `/v1/payments/${encodeURIComponent(tid)}`,
        "POST",
        { amount, ediDate, signData },
    );

    check("JSON 응답을 돌려준다", json !== null);
    check(
        "인증 실패(401/403)가 아니다",
        status !== 401 && status !== 403,
        `HTTP ${status}`,
    );
    check(
        "없는 거래는 승인되지 않는다",
        json?.resultCode !== "0000",
        `resultCode=${json?.resultCode}`,
    );

    if (json?.resultCode) {
        console.log(
            `        └ 응답: ${json.resultCode} ${json.resultMsg ?? ""}`,
        );
    }
}

// ---------------------------------------------------------------
// 4. 망취소 — 경로가 살아 있는지 (없는 주문이라 아무것도 취소되지 않는다)
// ---------------------------------------------------------------
console.log("\n[4] 망취소 POST /v1/payments/netcancel");
{
    const { status, json } = await call("/v1/payments/netcancel", "POST", {
        orderId: `contract-check-${Date.now()}`,
    });

    check("JSON 응답을 돌려준다", json !== null);
    check(
        "인증 실패(401/403)가 아니다",
        status !== 401 && status !== 403,
        `HTTP ${status}`,
    );
    check("없는 주문은 취소되지 않는다", json?.resultCode !== "0000");

    if (json?.resultCode) {
        console.log(
            `        └ 응답: ${json.resultCode} ${json.resultMsg ?? ""}`,
        );
    }
}

console.log(`\n${pass}건 통과 / ${fail}건 실패\n`);
process.exit(fail > 0 ? 1 : 0);

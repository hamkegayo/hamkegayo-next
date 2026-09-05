// 요금 계산 단위 테스트 (#46 · #76) — DB 없이 순수 함수만 검증한다.
//
// 실행:
//   npm run test:pricing
//
// 왜 로더가 필요한가
//   lib/pricing.ts 는 `@/lib/reservation` 을 import 한다. Node 의 타입
//   스트리핑은 tsconfig 의 paths 를 읽지 않아 그대로는 풀리지 않는다.
//   scripts/_ts-alias.mjs 가 `@/` 를 프로젝트 루트로 풀어준다.
//
// 왜 필요한가
//   여기 들어 있는 것은 **돈을 계산하는 함수**다. 구간 경계 하나가 틀리면
//   고객에게 과다 청구되거나 회사가 손실을 본다. 통합 테스트로는 경계값을
//   촘촘히 훑을 수 없다.

import {
    CANCEL_FLAT_FEE,
    calcCancelFee,
    calcCancelRefund,
    calcFinalCharge,
    calcPrepayment,
} from "@/lib/pricing";

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

const NOW = Date.UTC(2026, 8, 5, 0, 0, 0);
const MIN = 60_000;

/** 시작까지 n분 남은 시점의 취소수수료 */
function feeIn(minutes, opts = {}) {
    return calcCancelFee({
        plan: opts.plan ?? "basic",
        startAtMs: NOW + minutes * MIN,
        nowMs: NOW,
        isSurcharge: opts.isSurcharge ?? false,
        providerFault: opts.providerFault,
    });
}

console.log("\n▶ 취소수수료 구간 (약관 제19조)");

check("24시간 이전은 무료", feeIn(25 * 60).amount === 0);
check(
    "정확히 24시간 전도 무료 (경계는 고객에게 유리하게)",
    feeIn(24 * 60).bracket === "FREE",
);
check(
    `24시간 이내면 정액 ${CANCEL_FLAT_FEE.toLocaleString()}원`,
    feeIn(24 * 60 - 1).amount === CANCEL_FLAT_FEE,
);
check(
    "정확히 2시간 전은 아직 정액 구간",
    feeIn(120).bracket === "FLAT" && feeIn(120).amount === CANCEL_FLAT_FEE,
);
check(
    "2시간 전 이내면 1시간 이용요금 (Basic 20,000)",
    feeIn(119).bracket === "ONE_HOUR" && feeIn(119).amount === 20000,
);
check("Plus 는 1시간 25,000", feeIn(60, { plan: "plus" }).amount === 25000);
check(
    "주말·공휴일 할증이 붙는다 (20,000 → 26,000)",
    feeIn(60, { isSurcharge: true }).amount === 26000,
);
check(
    "회사·파트너 귀책은 임박해도 무료 (제16조 ⑦)",
    feeIn(1, { providerFault: true }).amount === 0 &&
        feeIn(1, { providerFault: true }).bracket === "PROVIDER_FAULT",
);
check(
    "시작 예정시각이 지나도 1시간 이용요금 구간",
    feeIn(-30).bracket === "ONE_HOUR",
);

console.log("\n▶ 취소 환불액");

check(
    "선결제액에서 수수료를 뺀다 (40,000 - 10,000)",
    calcCancelRefund(40000, 10000) === 30000,
);
check(
    "수수료가 선결제액을 넘어도 추가 청구하지 않는다",
    calcCancelRefund(5000, 10000) === 0,
);

console.log("\n▶ 선결제·최종요금 (약관 제11조 · 제13조 · 제21조)");

check(
    "1시간 예약도 2시간분을 선결제한다 (제21조 ①)",
    calcPrepayment("basic", 60, false).amount === 40000,
);
check(
    "주말은 30% 할증 (40,000 → 52,000, 제13조 ①)",
    calcPrepayment("basic", 120, true).amount === 52000,
);

const short = calcFinalCharge({
    plan: "basic",
    durationMinutes: 120,
    actualMinutes: 30,
    isSurcharge: false,
});
check(
    "30분만 써도 1시간이 청구된다 (제11조 ②③)",
    short.total === 20000 && short.minimumApplied === true,
);

const grace = calcFinalCharge({
    plan: "basic",
    durationMinutes: 120,
    actualMinutes: 128,
    isSurcharge: false,
});
check(
    "8분까지는 연장요금이 없다 (제11조 ④)",
    grace.total === 40000 && grace.extraMinutes === 0,
);

const over = calcFinalCharge({
    plan: "basic",
    durationMinutes: 120,
    actualMinutes: 129,
    isSurcharge: false,
});
check(
    "8분을 넘으면 15분 단위로 올린다 (제11조 ⑤)",
    over.extraMinutes === 15 && over.total === 45000,
    `연장 ${over.extraMinutes}분 / ${over.total}원`,
);

console.log(
    `\n${failed === 0 ? "🎉" : "⚠️"}  ${passed}건 통과 / ${failed}건 실패`,
);
process.exit(failed === 0 ? 0 : 1);

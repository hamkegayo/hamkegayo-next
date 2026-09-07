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
    oneHourCharge,
    calcCancelRefund,
    calcFinalCharge,
    calcPrepayment,
} from "@/lib/pricing";
import {
    isPastSlot,
    MIN_LEAD_MINUTES,
    reservationStartAt,
    TIME_OPTIONS,
    timeOptionsFor,
} from "@/app/(user)/reservation/_lib/options";

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

console.log("\n▶ 1시간 이용요금 (제11조 ②③ · 제17조 ② · 제19조)");

check("Basic 1시간은 20,000", oneHourCharge("basic", false) === 20000);
check("Plus 1시간은 25,000", oneHourCharge("plus", false) === 25000);
check(
    "주말·공휴일 할증이 붙는다 (20,000 → 26,000)",
    oneHourCharge("basic", true) === 26000,
);
check(
    "취소수수료의 1시간 구간과 같은 값이다",
    oneHourCharge("basic", false) === feeIn(60).amount,
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

// =============================================================
console.log("\n▶ 예약 가능 시각 (지난 시각 차단)");
// =============================================================
//  지난 시각으로 예약이 만들어지면 화면은 "매칭 진행 중" 을 보여주는데
//  정기 배치가 곧바로 CANCELLED 로 바꾼다. 파트너 목록을 여는 순간에도
//  만료 정리가 돌아서, 이용자는 매칭 중인 줄 알고 파트너에게는 아무것도
//  보이지 않는다. 실제로 프로덕션에서 그렇게 났다.
//
//  ⚠️ 이 함수들은 KST 를 고정한다. 서버(UTC)와 개발 기계(KST)에서 같은
//     결과가 나와야 하므로 기준시각을 넣어 검증한다.

// KST 2026-09-07 16:00 == UTC 07:00
const SLOT_NOW = new Date("2026-09-07T07:00:00Z");

check(
    "예약 시작 시각을 KST 로 만든다",
    reservationStartAt("2026-09-07", "9시 30분")?.toISOString() ===
        "2026-09-07T00:30:00.000Z",
    String(reservationStartAt("2026-09-07", "9시 30분")),
);

check(
    "오늘 이미 지난 시각은 막는다",
    isPastSlot("2026-09-07", "6시 30분", SLOT_NOW) === true,
);

check("여유시간 안쪽도 막는다", isPastSlot("2026-09-07", "16시 00분", SLOT_NOW) === true);

check(
    `여유시간(${MIN_LEAD_MINUTES}분) 뒤부터 열린다`,
    isPastSlot("2026-09-07", "16시 30분", SLOT_NOW) === false,
);

check(
    "다음 날은 모두 열린다",
    isPastSlot("2026-09-08", "6시 30분", SLOT_NOW) === false,
);

check(
    "오늘 남은 옵션만 남긴다",
    timeOptionsFor("2026-09-07", SLOT_NOW).length === 4 &&
        timeOptionsFor("2026-09-07", SLOT_NOW)[0] === "16시 30분",
    timeOptionsFor("2026-09-07", SLOT_NOW).join(","),
);

check(
    "다른 날짜는 전체 옵션이 그대로",
    timeOptionsFor("2026-09-08", SLOT_NOW).length === TIME_OPTIONS.length,
);

console.log(
    `\n${failed === 0 ? "🎉" : "⚠️"}  ${passed}건 통과 / ${failed}건 실패`,
);
process.exit(failed === 0 ? 0 : 1);

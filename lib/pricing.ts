/**
 * 예약 요금 계산 (서버/클라 공용 순수 모듈, #46).
 *  - 시간당 요금 · 최소청구 · 선결제 · 연장 · 할증 · 파트너 정산을 여기 한 곳에서 계산한다.
 *  - 부수효과 없음. 공휴일 판정은 lib/holidays.ts 가 맡고 여기엔 boolean 으로만 들어온다.
 *  - 금액은 전부 정수(원).
 *
 * 근거 조항 (`.claude/legal/terms.md`)
 *  - 제11조 ①   : Basic 시간당 20,000 / Plus 시간당 25,000
 *  - 제11조 ②③ : 최소 청구금액은 각 상품의 1시간 이용요금, 환급하지 않음
 *  - 제11조 ④   : 종료 예정시각 이후 8분까지는 연장요금 없음
 *  - 제11조 ⑤   : 8분 초과 시 실제 초과시간을 15분 단위로 올림
 *  - 제11조 ⑥   : 병원 내 대기시간은 이용시간에 포함
 *  - 제13조 ①   : 토·일·공휴일·대체공휴일 30% 할증 (기획 확정 — 모든 금액에 적용)
 *  - 제15조 ②   : 이용자 지각시간은 이용시간에 포함
 *  - 제16조 ①   : 파트너 지각분은 이용시간으로 청구하지 않음
 *  - 제21조 ①   : 예상 이용시간 2시간분 선결제
 *  - 제21조 ③④⑤ : 종료 후 최종 산정 → 미달분 환불 / 초과분 추가결제
 */

import { PLAN_INFO, type PlanCode } from "@/lib/reservation";

// =============================================================
// 상수 — 정책 수치는 전부 여기에 모은다
// =============================================================

/** 청구 시간 단위(분). 조기 종료·연장 공통으로 이 단위로 올림한다. */
export const BILLING_UNIT_MIN = 15;

/** 최소 청구시간(분) — 약관 제11조 ②③ */
export const MIN_BILLABLE_MIN = 60;

/** 선결제 최소 시간(분) — 약관 제21조 ① */
export const MIN_PREPAY_MIN = 120;

/** 연장요금 유예(분) — 약관 제11조 ④ */
export const EXTENSION_GRACE_MIN = 8;

/** 주말·공휴일 할증률 — 약관 제13조 ① */
export const SURCHARGE_RATE = 0.3;

/**
 * 파트너 선택 후 선결제 기한(분) — 약관 제9조 ④.
 * 실제 강제는 DB(reservations.payment_deadline)가 하고, 여기 값은 화면 안내용이다.
 * 둘을 함께 바꿔야 한다.
 */
export const PAYMENT_DEADLINE_MIN = 30;

/**
 * 추가결제 관리자 검토 기준액(원) — **총액** 기준.
 *
 *  종료 시각을 잘못 눌러 연장이 크게 잡히면 그대로 청구된다. 넘는 건은
 *  링크를 바로 보내지 않고 사람이 한 번 본다.
 *
 *  10만~15만 범위에서 **15만으로 확정했다**(2026-09-05 리뷰). Basic 기준
 *  7.5시간에 해당해 수술·투석처럼 긴 일정이 정상적으로 이 아래에 들어온다.
 *  더 낮추면 오탐이 늘어 검토가 형식이 된다.
 *
 *  **총액 기준**인 것이 중요하다. 이번 청구액만 보면 여러 번 쪼개 넘길 수 있다.
 */
export const EXTENSION_REVIEW_THRESHOLD = 150_000;

/** 결제액 대비 포인트 적립률 (1P = 1원). 약관 표기는 '크레딧'이나 제품 용어는 포인트다. */
export const POINT_EARN_RATE = 0.01;

// =============================================================
// duration 파싱 · 시간 단위
// =============================================================

/** "2시간 30분" / "2시간" / "45분" 형식만 허용 */
const DURATION_RE = /^(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?$/;

/** duration 문자열("2시간 30분") → 분. 형식이 아니면 null. */
export function parseDurationMinutes(duration: string): number | null {
    const s = duration.trim();
    if (!s) return null;

    const m = DURATION_RE.exec(s);
    if (!m || (!m[1] && !m[2])) return null;

    const minutes = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
    return minutes > 0 ? minutes : null;
}

/** 분 → "2시간 30분" (0분이면 "0분") */
export function formatMinutes(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h === 0) return `${rest}분`;
    if (rest === 0) return `${h}시간`;
    return `${h}시간 ${rest}분`;
}

/** 지정 단위(기본 15분)로 올림 */
export function ceilToUnit(
    minutes: number,
    unit: number = BILLING_UNIT_MIN,
): number {
    if (minutes <= 0) return 0;
    return Math.ceil(minutes / unit) * unit;
}

/** 할증 여부 → 할증률 (0 또는 0.3) */
export function surchargeRateOf(isSurcharge: boolean): number {
    return isSurcharge ? SURCHARGE_RATE : 0;
}

// =============================================================
// 금액 산정
// =============================================================

/** 분 × 시간당 단가 → 할증 전 금액(원) */
export function baseAmountFor(plan: PlanCode, minutes: number): number {
    if (minutes <= 0) return 0;
    return Math.round((PLAN_INFO[plan].price * minutes) / 60);
}

/** 할증 전 금액 → 할증 후 금액(원) */
export function withSurcharge(amount: number, rate: number): number {
    return Math.round(amount * (1 + rate));
}

// =============================================================
// 선결제 (예약 확정 시점)
// =============================================================

export type Prepayment = {
    /** 예상 이용시간(분) */
    durationMinutes: number;
    /** 선결제 대상 시간(분) — max(2시간, 예상 이용시간) */
    prepayMinutes: number;
    /** 할증 전 금액 */
    baseAmount: number;
    /** 할증으로 더해진 금액 */
    surchargeAmount: number;
    surchargeRate: number;
    /** 최종 선결제액 */
    amount: number;
};

/**
 * 선결제액 — max(2시간, 예상 이용시간)분 + 할증.
 * 약관 제21조 ①. 할증은 기획 확정에 따라 선결제에도 미리 반영한다.
 */
export function calcPrepayment(
    plan: PlanCode,
    durationMinutes: number,
    isSurcharge: boolean,
): Prepayment {
    const prepayMinutes = Math.max(MIN_PREPAY_MIN, durationMinutes);
    const rate = surchargeRateOf(isSurcharge);
    const baseAmount = baseAmountFor(plan, prepayMinutes);
    const amount = withSurcharge(baseAmount, rate);

    return {
        durationMinutes,
        prepayMinutes,
        baseAmount,
        surchargeAmount: amount - baseAmount,
        surchargeRate: rate,
        amount,
    };
}

// =============================================================
// 최종 이용요금 (서비스 종료 시점)
// =============================================================

export type FinalCharge = {
    /** 실제 이용시간(분) */
    actualMinutes: number;
    /** 예정시간 범위의 청구 분 */
    baseMinutes: number;
    /** 연장 청구 분 */
    extraMinutes: number;
    /** 총 청구 분 */
    billedMinutes: number;
    /** 할증 전 기본요금 */
    baseAmount: number;
    /** 할증 전 연장요금 */
    extraAmount: number;
    /** 할증으로 더해진 금액 */
    surchargeAmount: number;
    surchargeRate: number;
    /** 최종 이용요금 */
    total: number;
    /** 최소청구 1시간이 적용됐는지 (제11조 ②③) */
    minimumApplied: boolean;
};

/**
 * 최종 이용요금 — 실제 이용시간 기준.
 *
 *  - 예정 종료시각 +8분 이내 : 실제 이용시간을 15분 올림 (예정시간 상한, 최소 1시간)
 *  - 8분 초과               : 예정시간 + 초과분 15분 올림
 */
export function calcFinalCharge(params: {
    plan: PlanCode;
    /** 예약한 예상 이용시간(분) */
    durationMinutes: number;
    /** 실제 이용시간(분) */
    actualMinutes: number;
    isSurcharge: boolean;
}): FinalCharge {
    const { plan, durationMinutes, isSurcharge } = params;
    const actualMinutes = Math.max(0, Math.round(params.actualMinutes));
    const rate = surchargeRateOf(isSurcharge);

    const overrun = actualMinutes - durationMinutes;

    let baseMinutes: number;
    let extraMinutes: number;

    if (overrun > EXTENSION_GRACE_MIN) {
        // 연장 — 초과분만 15분 단위로 올림 (제11조 ⑤)
        baseMinutes = durationMinutes;
        extraMinutes = ceilToUnit(overrun);
    } else {
        // 예정시간 이내(유예 포함) — 실제 이용시간을 15분 올림, 예정시간이 상한
        baseMinutes = ceilToUnit(Math.min(actualMinutes, durationMinutes));
        extraMinutes = 0;
    }

    // 최소청구 1시간 (제11조 ②③)
    const minimumApplied = baseMinutes + extraMinutes < MIN_BILLABLE_MIN;
    if (minimumApplied) baseMinutes = MIN_BILLABLE_MIN;

    const billedMinutes = baseMinutes + extraMinutes;
    const baseAmount = baseAmountFor(plan, baseMinutes);
    const extraAmount = baseAmountFor(plan, extraMinutes);
    const total = withSurcharge(baseAmount + extraAmount, rate);

    return {
        actualMinutes,
        baseMinutes,
        extraMinutes,
        billedMinutes,
        baseAmount,
        extraAmount,
        surchargeAmount: total - (baseAmount + extraAmount),
        surchargeRate: rate,
        total,
        minimumApplied,
    };
}

// =============================================================
// 예약 일시 파싱
//  - use_date 는 "YYYY-MM-DD", 시각은 "9시 30분" / "09:30" 등으로 저장된다.
//  - 예약 일시는 KST 기준이다(expire_past_matchings 와 동일한 해석).
// =============================================================

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "9시 30분" / "09:30" → 자정 기준 분. 분이 없으면 0. 형식이 아니면 null. */
export function parseClockMinutes(time: string): number | null {
    const m = /^(\d{1,2})(?:\D+(\d{1,2}))?/.exec(time.trim());
    if (!m) return null;

    const h = Number(m[1]);
    const min = m[2] === undefined ? 0 : Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/** use_date + 시각 문자열 → epoch ms (KST 해석). 형식이 아니면 null. */
export function toEpochMs(useDate: string, time: string): number | null {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(useDate.trim());
    const minutes = parseClockMinutes(time);
    if (!d || minutes === null) return null;

    const utcMidnight = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
    return utcMidnight + minutes * 60_000 - KST_OFFSET_MS;
}

// =============================================================
// 이용시간 산정
// =============================================================

/**
 * 과금 시작 기준시각 — max(예약 시작 예정시각, 파트너가 현장에 준비된 시각).
 *  - 파트너 지각분은 청구하지 않는다 (제16조 ①) → 도착이 늦으면 도착시각부터.
 *  - 이용자 지각분은 청구한다 (제15조 ②)     → 도착이 이르면 예약시각부터.
 *  - 도착 통보가 없으면 시작 버튼 시각으로 갈음한다.
 */
export function billingStartMs(params: {
    plannedStartMs: number;
    arrivedAtMs: number | null;
    startedAtMs: number | null;
}): number {
    const { plannedStartMs, arrivedAtMs, startedAtMs } = params;
    const partnerReadyMs = arrivedAtMs ?? startedAtMs;
    if (partnerReadyMs === null) return plannedStartMs;
    return Math.max(plannedStartMs, partnerReadyMs);
}

/** 과금 대상 실제 이용시간(분) — 시작 기준시각 ~ 종료 버튼 시각 */
export function actualMinutesBetween(startMs: number, endMs: number): number {
    return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

// =============================================================
// 예약 취소 수수료 (약관 제19조)
//
//  조문의 표는 8행이지만 **서비스 시작 전 취소** 로 도달 가능한 것은 4행이다.
//  나머지(조기 종료 · 노쇼 · 이용자 귀책 중단)는 서비스가 시작된 뒤의 정산
//  경로이고 제17조·제21조가 금액을 정한다 — 여기서 다루지 않는다.
// =============================================================

/** 취소수수료가 0 이 되는 시점(분) — 제19조 "서비스 시작 24시간 이전" */
export const CANCEL_FREE_BEFORE_MIN = 24 * 60;

/** 정액 수수료 구간의 하한(분) — 제19조 "24시간 이내 ~ 2시간 전" */
export const CANCEL_FLAT_BEFORE_MIN = 2 * 60;

/** 정액 취소수수료(원) — 제19조 */
export const CANCEL_FLAT_FEE = 10_000;

export type CancelFeeBracket =
    /** 24시간 이전 — 수수료 없음 */
    | "FREE"
    /** 24시간 이내 ~ 2시간 전 — 10,000원 */
    | "FLAT"
    /** 2시간 전 이내 ~ 시작 전 — 1시간 이용요금 */
    | "ONE_HOUR"
    /** 회사 또는 파트너 귀책 — 이용요금 및 취소수수료 없음 */
    | "PROVIDER_FAULT";

export type CancelFee = {
    /** 환불하지 않고 남기는 금액(원). 별도 청구가 아니다 — 제19조 ② */
    amount: number;
    bracket: CancelFeeBracket;
    /** 서비스 시작 예정시각까지 남은 분. 음수면 예정시각이 지났다 */
    minutesUntilStart: number;
};

/**
 * 서비스 시작 전 예약 취소의 취소수수료 — 약관 제19조.
 *
 *  ⚠️ 이 값은 **환불하지 않는 금액**이지 별도로 청구하는 금액이 아니다(제19조 ②).
 *     선결제액에서 이만큼을 빼고 나머지를 환불한다.
 *
 *  경계는 고객에게 유리한 쪽으로 잡았다. 정확히 24시간 전이면 "24시간 이전"으로
 *  보아 무료이고, 정확히 2시간 전이면 정액 구간이다. 조문이 "24시간 이내"·
 *  "2시간 전 이내" 라고 쓰고 있어 그 경계값 자체는 이내에 들지 않는다.
 *
 *  "해당 상품 1시간 이용요금" 에 할증을 적용한다. 제19조가 명시하지는 않지만,
 *  같은 표현을 쓰는 최소청구(제11조 ③)를 calcFinalCharge 가 할증 포함으로
 *  계산하고 있어 그쪽과 맞췄다. → 🔸 기획 확인 항목
 */
/**
 * "해당 상품 1시간 이용요금" — 약관이 여러 곳에서 같은 표현을 쓴다.
 *
 *   · 제11조 ②③ 최소 청구금액
 *   · 제19조    2시간 전 이내 취소 · 이용자 노쇼
 *   · 제17조 ②  이용자 귀책 중단
 *
 *  할증을 포함한다 — calcFinalCharge 가 최소청구를 할증 포함으로 계산하므로
 *  같은 표현이 다른 금액이 되지 않게 맞춘다.
 */
export function oneHourCharge(plan: PlanCode, isSurcharge: boolean): number {
    return withSurcharge(
        baseAmountFor(plan, MIN_BILLABLE_MIN),
        surchargeRateOf(isSurcharge),
    );
}

export function calcCancelFee(params: {
    plan: PlanCode;
    /** 서비스 시작 예정시각 (epoch ms) */
    startAtMs: number;
    /** 취소 시각 (epoch ms) */
    nowMs: number;
    isSurcharge: boolean;
    /** 회사 또는 파트너 귀책이면 수수료를 받지 않는다 (제19조 · 제16조 ⑦) */
    providerFault?: boolean;
}): CancelFee {
    const minutesUntilStart = Math.floor(
        (params.startAtMs - params.nowMs) / 60_000,
    );

    if (params.providerFault) {
        return { amount: 0, bracket: "PROVIDER_FAULT", minutesUntilStart };
    }

    if (minutesUntilStart >= CANCEL_FREE_BEFORE_MIN) {
        return { amount: 0, bracket: "FREE", minutesUntilStart };
    }

    if (minutesUntilStart >= CANCEL_FLAT_BEFORE_MIN) {
        return { amount: CANCEL_FLAT_FEE, bracket: "FLAT", minutesUntilStart };
    }

    return {
        amount: oneHourCharge(params.plan, params.isSurcharge),
        bracket: "ONE_HOUR",
        minutesUntilStart,
    };
}

/**
 * 취소 시 실제 환불액 — 선결제액에서 취소수수료를 뺀 나머지.
 * 수수료가 선결제액을 넘으면 환불액은 0 이다(추가 청구하지 않는다).
 */
export function calcCancelRefund(
    prepaidAmount: number,
    cancelFee: number,
): number {
    return Math.max(0, prepaidAmount - cancelFee);
}

// =============================================================
// 정산 차액 · 파트너 지급액
// =============================================================

export type SettlementDiff = {
    /** 선결제액 중 돌려줄 금액 (제21조 ④) */
    refund: number;
    /** 추가로 받을 금액 (제21조 ⑤) */
    additional: number;
};

/** 선결제액 vs 최종 이용요금 → 환불액 / 추가결제액 */
export function calcSettlementDiff(
    prepaidAmount: number,
    finalAmount: number,
): SettlementDiff {
    const diff = finalAmount - prepaidAmount;
    return {
        refund: diff < 0 ? -diff : 0,
        additional: diff > 0 ? diff : 0,
    };
}

/**
 * 결제액에 대한 포인트 적립액(원). 1P = 1원, 원 단위 절사.
 * 적립 기록은 결제 성공 시 서버에서 points 원장에 남긴다.
 */
export function calcPointEarn(paidAmount: number): number {
    if (paidAmount <= 0) return 0;
    return Math.floor(paidAmount * POINT_EARN_RATE);
}

export type PartnerPayout = {
    /** 정산 기준 금액 = 최종 이용요금 */
    amount: number;
    feeRate: number;
    /** 플랫폼 수수료 */
    fee: number;
    /** 파트너 실지급액 */
    net: number;
};

/**
 * 파트너 지급액 — 최종 결제 총액 기준으로 플랫폼 수수료를 뗀다.
 * 파트너는 프리랜서이므로 원천징수는 하지 않는다 (기획 확정).
 */
export function calcPartnerPayout(
    plan: PlanCode,
    finalAmount: number,
): PartnerPayout {
    const feeRate = PLAN_INFO[plan].feeRate;
    const fee = Math.round(finalAmount * feeRate);
    return { amount: finalAmount, feeRate, fee, net: finalAmount - fee };
}

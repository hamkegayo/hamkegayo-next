import { describe, expect, it } from "vitest";

import {
    calcFinalCharge,
    calcPrepayment,
    ceilToUnit,
    formatMinutes,
    parseDurationMinutes,
    surchargeRateOf,
    SURCHARGE_RATE,
} from "@/lib/pricing";

// 기존 경계값 회귀는 scripts/test-pricing.mjs(npm run test:pricing)에 있다.
// 여기서는 약관 조항별 규칙을 Vitest 형식으로 옮겨 새 테스트의 예시로 삼는다.

describe("이용시간 문자열 파싱", () => {
    it.each([
        ["2시간 30분", 150],
        ["2시간", 120],
        ["45분", 45],
    ])("%s → %i분", (input, minutes) => {
        expect(parseDurationMinutes(input)).toBe(minutes);
    });

    it.each(["", "0분", "두 시간", "2h"])("형식이 아니면 null: %j", (input) => {
        expect(parseDurationMinutes(input)).toBeNull();
    });

    it("분 → 표시 문자열", () => {
        expect(formatMinutes(150)).toBe("2시간 30분");
        expect(formatMinutes(120)).toBe("2시간");
        expect(formatMinutes(0)).toBe("0분");
    });
});

describe("15분 단위 올림 (약관 제11조 ⑤)", () => {
    it.each([
        [1, 15],
        [15, 15],
        [16, 30],
        [0, 0],
    ])("%i분 → %i분", (input, expected) => {
        expect(ceilToUnit(input)).toBe(expected);
    });
});

describe("주말·공휴일 할증 (약관 제13조 ①, #206)", () => {
    it("신규 예약은 현재 운영 할증률 0%를 적용한다", () => {
        expect(SURCHARGE_RATE).toBe(0);
        expect(surchargeRateOf(true)).toBe(0);
    });

    it("기존 예약은 저장된 할증률을 그대로 쓴다", () => {
        expect(surchargeRateOf(true, 0.3)).toBe(0.3);
        expect(surchargeRateOf(false, 0)).toBe(0);
    });

    it("저장된 할증률이 범위를 벗어나면 계산을 거부한다", () => {
        expect(() => surchargeRateOf(true, 1.5)).toThrow();
        expect(() => surchargeRateOf(true, Number.NaN)).toThrow();
    });
});

describe("선결제 (약관 제21조 ①)", () => {
    it("예상 이용시간이 2시간 미만이어도 2시간분을 받는다", () => {
        const p = calcPrepayment("basic", 60, false);
        expect(p.prepayMinutes).toBe(120);
        expect(p.amount).toBe(40_000);
    });

    it("기존 주말 예약은 저장된 30% 할증이 선결제에 반영된다", () => {
        const p = calcPrepayment("basic", 120, true, 0.3);
        expect(p.baseAmount).toBe(40_000);
        expect(p.surchargeAmount).toBe(12_000);
        expect(p.amount).toBe(52_000);
    });
});

describe("최종 이용요금 (약관 제11조)", () => {
    const base = {
        plan: "basic" as const,
        durationMinutes: 120,
        isSurcharge: false,
    };

    it("예정시간 +8분 이내 초과는 연장요금을 받지 않는다", () => {
        const c = calcFinalCharge({ ...base, actualMinutes: 128 });
        expect(c.extraMinutes).toBe(0);
        expect(c.total).toBe(40_000);
    });

    it("8분을 넘으면 초과분 전체를 15분 단위로 올려 청구한다", () => {
        const c = calcFinalCharge({ ...base, actualMinutes: 129 });
        expect(c.extraMinutes).toBe(15);
        expect(c.total).toBe(45_000);
    });

    it("1시간 미만 이용도 최소 1시간을 청구한다", () => {
        const c = calcFinalCharge({ ...base, actualMinutes: 20 });
        expect(c.minimumApplied).toBe(true);
        expect(c.billedMinutes).toBe(60);
        expect(c.total).toBe(20_000);
    });
});

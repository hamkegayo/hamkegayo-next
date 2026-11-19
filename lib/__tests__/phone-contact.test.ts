import { afterEach, describe, expect, it, vi } from "vitest";

import {
    isTouchPrimaryDevice,
    isWithinSupportHours,
    normalizeTelHref,
} from "@/lib/phone-contact";

/** KST 시각을 UTC Date 로 (KST = UTC+9) */
function kst(hhmm: string): Date {
    return new Date(`2026-11-19T${hhmm}:00+09:00`);
}

describe("isWithinSupportHours — 약관 부칙 고객센터 06:00-18:00 (KST)", () => {
    it.each([
        ["05:59", false],
        ["06:00", true],
        ["12:00", true],
        ["17:59", true],
        ["18:00", false],
        ["23:59", false],
        ["00:00", false],
    ])("KST %s → %s", (hhmm, expected) => {
        expect(isWithinSupportHours(kst(hhmm))).toBe(expected);
    });

    it("UTC 기준 시각을 KST 로 환산한다 (UTC 20:59 = KST 05:59, 21:00 = 06:00)", () => {
        expect(isWithinSupportHours(new Date("2026-11-19T20:59:00Z"))).toBe(
            false,
        );
        expect(isWithinSupportHours(new Date("2026-11-19T21:00:00Z"))).toBe(
            true,
        );
        expect(isWithinSupportHours(new Date("2026-11-19T08:59:00Z"))).toBe(
            true,
        );
        expect(isWithinSupportHours(new Date("2026-11-19T09:00:00Z"))).toBe(
            false,
        );
    });

    it("요일과 무관하다 (약관 부칙에 평일 조건이 없다)", () => {
        // 2026-11-21 은 토요일, 11-22 는 일요일
        expect(
            isWithinSupportHours(new Date("2026-11-21T10:00:00+09:00")),
        ).toBe(true);
        expect(
            isWithinSupportHours(new Date("2026-11-22T10:00:00+09:00")),
        ).toBe(true);
    });
});

describe("isTouchPrimaryDevice — 주 포인터로만 판별", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubMedia(matches: Record<string, boolean>) {
        vi.stubGlobal("window", {
            matchMedia: (q: string) => ({ matches: matches[q] ?? false }),
        });
    }

    it("SSR(window 없음) → false", () => {
        expect(isTouchPrimaryDevice()).toBe(false);
    });
    it("matchMedia 미지원 → false", () => {
        vi.stubGlobal("window", {});
        expect(isTouchPrimaryDevice()).toBe(false);
    });
    it("pointer: coarse (휴대폰·태블릿) → true", () => {
        stubMedia({ "(pointer: coarse)": true, "(any-pointer: coarse)": true });
        expect(isTouchPrimaryDevice()).toBe(true);
    });
    it("pointer: fine (마우스 PC) → false", () => {
        stubMedia({ "(pointer: fine)": true });
        expect(isTouchPrimaryDevice()).toBe(false);
    });
    it("터치 노트북 (pointer: fine + any-pointer: coarse) → false", () => {
        stubMedia({ "(pointer: fine)": true, "(any-pointer: coarse)": true });
        expect(isTouchPrimaryDevice()).toBe(false);
    });
});

describe("normalizeTelHref", () => {
    it("tel: 접두사를 한 번만 붙인다", () => {
        expect(normalizeTelHref("010-0000-0000")).toBe("tel:010-0000-0000");
        expect(normalizeTelHref("tel:010-0000-0000")).toBe("tel:010-0000-0000");
    });
});

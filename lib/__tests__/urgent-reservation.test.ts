import { describe, expect, it } from "vitest";

import {
    isUrgentReservation,
    reservationStartMs,
} from "@/lib/urgent-reservation";

// 예약 시각: 2026-12-10 10:00 KST = 2026-12-10T01:00:00Z
const START = Date.parse("2026-12-10T01:00:00Z");
const H = 60 * 60 * 1000;

describe("reservationStartMs", () => {
    it("날짜+시각을 KST 로 해석한다 (서버 시간대와 무관)", () => {
        expect(reservationStartMs("2026-12-10", "10:00")).toBe(START);
    });
    it("DB·폼의 10시 00분·10:00:00 형식도 같은 값이다", () => {
        expect(reservationStartMs("2026-12-10", "10시 00분")).toBe(START);
        expect(reservationStartMs("2026-12-10", "10:00:00")).toBe(START);
    });
    it("입력이 덜 채워졌거나 형식이 아니면 null", () => {
        expect(reservationStartMs("", "10:00")).toBeNull();
        expect(reservationStartMs("2026-12-10", "")).toBeNull();
        expect(reservationStartMs("2026-12-10", "25:00")).toBeNull();
        expect(reservationStartMs("12/10", "10:00")).toBeNull();
    });
});

describe("isUrgentReservation — 24시간 미만(KST) 경계", () => {
    const urgent = (nowMs: number) =>
        isUrgentReservation("2026-12-10", "10:00", nowMs);

    it("정확히 24시간 남았으면 급한 예약이 아니다", () => {
        expect(urgent(START - 24 * H)).toBe(false);
    });
    it("24시간에서 1ms 모자라면 급한 예약이다", () => {
        expect(urgent(START - 24 * H + 1)).toBe(true);
    });
    it("24시간 1ms 넘게 남았으면 급한 예약이 아니다", () => {
        expect(urgent(START - 24 * H - 1)).toBe(false);
    });
    it("이미 지난 시각도 급한 예약이다", () => {
        expect(urgent(START + H)).toBe(true);
    });
    it("전날 같은 시각(KST) 전후로 갈린다", () => {
        // 전날 09:59 KST = 2026-12-09T00:59Z → 24시간 1분 전 → 아님
        expect(urgent(Date.parse("2026-12-09T00:59:00Z"))).toBe(false);
        // 전날 10:01 KST = 2026-12-09T01:01Z → 23시간 59분 전 → 급함
        expect(urgent(Date.parse("2026-12-09T01:01:00Z"))).toBe(true);
    });
    it("UTC 날짜가 하루 다른 새벽 예약도 KST 로 계산한다", () => {
        // 2026-12-10 00:30 KST = 2026-12-09T15:30Z. 24시간 전 = 2026-12-08T15:30Z
        const at = (iso: string) =>
            isUrgentReservation("2026-12-10", "00:30", Date.parse(iso));
        expect(at("2026-12-08T15:30:00Z")).toBe(false);
        expect(at("2026-12-08T15:31:00Z")).toBe(true);
    });
    it("Date 객체도 받는다", () => {
        expect(
            isUrgentReservation("2026-12-10", "10:00", new Date(START - 2 * H)),
        ).toBe(true);
    });
    it("입력이 비어 있으면 강조하지 않는다", () => {
        expect(isUrgentReservation("", "", START)).toBe(false);
    });
});

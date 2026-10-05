import { describe, expect, it } from "vitest";

import {
    addCalendarDays,
    isBeyondAdvanceReservationWindow,
    maxAdvanceReservationDate,
} from "@/lib/reservation-window";

describe("사전 예약 가능 기간", () => {
    // KST 2026-10-05 08:00 = UTC 2026-10-04 23:00
    const now = new Date("2026-10-04T23:00:00Z");

    it("마지막 예약 가능일은 KST 결제일 + 59일이다", () => {
        expect(maxAdvanceReservationDate(now)).toBe("2026-12-03");
    });

    it("마지막 날까지는 허용하고 다음 날부터 막는다", () => {
        expect(isBeyondAdvanceReservationWindow("2026-12-03", now)).toBe(false);
        expect(isBeyondAdvanceReservationWindow("2026-12-04", now)).toBe(true);
    });

    it("달력에 없는 날짜는 계산하지 않는다", () => {
        expect(addCalendarDays("2026-02-30", 1)).toBeNull();
        expect(addCalendarDays("2026-02-28", 1)).toBe("2026-03-01");
    });
});

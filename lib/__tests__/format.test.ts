import { describe, expect, it } from "vitest";

import {
    kstCompactDate,
    kstDate,
    kstDateTime,
    kstTime,
    weekdayOf,
} from "@/lib/format";

// 실제 사고: 서버(UTC)와 개발 PC(KST) 차이로 확정 시각이 9시간 어긋났고,
// KST 09시 이전에 만든 예약번호에 전날 날짜가 들어갔다. vitest.config.ts가 TZ=UTC로 고정한다.

describe("KST 포맷 (서버 UTC 기준)", () => {
    it("테스트는 UTC 서버 환경에서 돈다", () => {
        expect(process.env.TZ).toBe("UTC");
    });

    it("UTC 전날 밤은 KST로 다음 날 아침이다", () => {
        const at = "2026-10-04T23:30:00Z"; // KST 2026-10-05 08:30
        expect(kstDate(at)).toBe("2026-10-05");
        expect(kstTime(at)).toBe("08:30");
        expect(kstCompactDate(at)).toBe("20261005");
    });

    it("KST 자정은 24:00이 아니라 00:00으로 표시한다", () => {
        expect(kstDateTime("2026-10-04T15:00:00Z")).toBe("2026.10.05 00:00");
    });

    it("값이 없거나 잘못되면 null", () => {
        expect(kstDate(null)).toBeNull();
        expect(kstTime("not-a-date")).toBeNull();
    });

    it("이용일 요일은 시간대와 무관하게 날짜로 판정한다", () => {
        expect(weekdayOf("2026-10-05")).toBe("월");
        expect(weekdayOf("2026-10-04")).toBe("일");
    });
});

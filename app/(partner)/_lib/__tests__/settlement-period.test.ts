import { describe, expect, it } from "vitest";

import {
    filterSettlementsByPeriod,
    settlementPeriodRange,
    summarizeSettlements,
    type Settlement,
} from "../settlement";

const row = (
    useDate: string,
    status: "paid" | "pending",
    amount: number,
): Settlement => ({
    id: `ST-${useDate}`,
    serviceDate: useDate,
    useDate,
    hospital: "R0000",
    plan: "Basic",
    amount,
    grossAmount: amount,
    fee: 0,
    status,
    settledDate: null,
});

const TODAY = "2026-10-07";
const LIST = [
    row("2026-10-07", "pending", 10000),
    row("2026-10-01", "paid", 20000),
    row("2026-09-30", "paid", 30000),
    row("2026-09-08", "paid", 40000),
    row("2026-09-07", "pending", 50000),
];

// 정산 내역 조회 기간이 실제로 목록·요약을 거른다 (#272)
describe("정산 내역 조회 기간", () => {
    it("오늘·7일·30일은 서비스 일자 기준으로 끝 날짜를 포함해 거른다", () => {
        expect(filterSettlementsByPeriod(LIST, "오늘", TODAY)).toHaveLength(1);
        expect(filterSettlementsByPeriod(LIST, "7일", TODAY)).toHaveLength(2);
        // 30일 = 09-08 ~ 10-07
        expect(
            filterSettlementsByPeriod(LIST, "30일", TODAY).map(
                (x) => x.useDate,
            ),
        ).toEqual(["2026-10-07", "2026-10-01", "2026-09-30", "2026-09-08"]);
        expect(filterSettlementsByPeriod(LIST, "전체", TODAY)).toHaveLength(5);
    });

    it("표시 날짜는 선택 기간을 따른다. 전체는 목록의 처음·끝", () => {
        expect(settlementPeriodRange("7일", TODAY, LIST)).toEqual({
            from: "2026-10-01",
            to: TODAY,
        });
        expect(settlementPeriodRange("전체", TODAY, LIST)).toEqual({
            from: "2026-09-07",
            to: TODAY,
        });
        expect(settlementPeriodRange("전체", TODAY, [])).toBeNull();
    });

    it("요약의 정산 완료 건수는 지급 완료 건수다", () => {
        const s = summarizeSettlements(
            filterSettlementsByPeriod(LIST, "30일", TODAY),
        );
        expect(s).toEqual({
            totalAmount: 100000,
            serviceCount: 4,
            paidCount: 3,
            pendingCount: 1,
        });
    });
});

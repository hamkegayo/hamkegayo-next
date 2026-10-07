/** 파트너 정산 공용 타입 · 헬퍼 (데이터는 settlement.server.ts) */

import { type SettlementStatus } from "@/lib/reservation";

// 상태 타입은 공용 단일 소스로 이동(#20). 기존 import 경로 호환을 위해 재-export.
export type { SettlementStatus };

export type Settlement = {
    /** 정산 식별자 (표시용) */
    id: string;
    /** 서비스 일자 (2025.05.30 (금)) */
    serviceDate: string;
    /** 서비스 일자 YYYY-MM-DD — 조회 기간 필터용 (#272) */
    useDate: string;
    hospital: string;
    plan: "Basic" | "Plus";
    /** 실지급액 = 서비스 금액 − 플랫폼 수수료 (없으면 null) */
    amount: number | null;
    /** 고객이 결제한 서비스 총액 (없으면 null) */
    grossAmount: number | null;
    /** 플랫폼 수수료 — Basic 20% / Plus 24%, 원천징수 없음 */
    fee: number | null;
    status: SettlementStatus;
    /** 정산일 (미지급이면 null) */
    settledDate: string | null;
};

/** 정산 요약(대시보드/내역 상단) */
export type SettlementSummary = {
    totalAmount: number;
    /** 완료된 서비스(정산 생성) 건수 */
    serviceCount: number;
    /** 지급 완료 건수 */
    paidCount: number;
    /** 지급 예정 건수 */
    pendingCount: number;
};

// =============================================================
// 정산 내역 조회 기간 (#272) — 서비스 일자 기준. 이미 불러온 목록을 화면에서 거른다.
// =============================================================

export const SETTLEMENT_PERIODS = ["오늘", "7일", "30일", "전체"] as const;
export type SettlementPeriod = (typeof SETTLEMENT_PERIODS)[number];

/** YYYY-MM-DD 에서 n 일 전 (UTC 산술 — 날짜만 다루므로 시간대 영향 없음) */
function daysBefore(isoDate: string, n: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
}

/** 선택 기간의 시작·끝(YYYY-MM-DD). 전체는 목록의 가장 이른·늦은 날, 비어 있으면 null */
export function settlementPeriodRange(
    period: SettlementPeriod,
    today: string,
    list: Settlement[],
): { from: string; to: string } | null {
    if (period === "오늘") return { from: today, to: today };
    if (period === "7일") return { from: daysBefore(today, 6), to: today };
    if (period === "30일") return { from: daysBefore(today, 29), to: today };
    const dates = list
        .map((x) => x.useDate)
        .filter(Boolean)
        .sort();
    return dates.length
        ? { from: dates[0], to: dates[dates.length - 1] }
        : null;
}

export function filterSettlementsByPeriod(
    list: Settlement[],
    period: SettlementPeriod,
    today: string,
): Settlement[] {
    if (period === "전체") return list;
    const range = settlementPeriodRange(period, today, list);
    if (!range) return list;
    return list.filter((x) => x.useDate >= range.from && x.useDate <= range.to);
}

/** 화면 목록 기준 요약. 서버 요약과 같은 정의(실지급액 합계, 지급 완료/예정 건수) */
export function summarizeSettlements(list: Settlement[]): SettlementSummary {
    return {
        totalAmount: list.reduce((sum, x) => sum + (x.amount ?? 0), 0),
        serviceCount: list.length,
        paidCount: list.filter((x) => x.status === "paid").length,
        pendingCount: list.filter((x) => x.status !== "paid").length,
    };
}

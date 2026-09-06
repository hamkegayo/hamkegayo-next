/** 파트너 정산 공용 타입 · 헬퍼 (데이터는 settlement.server.ts) */

import { type SettlementStatus } from "@/lib/reservation";

// 상태 타입은 공용 단일 소스로 이동(#20). 기존 import 경로 호환을 위해 재-export.
export type { SettlementStatus };

export type Settlement = {
    /** 정산 식별자 (표시용) */
    id: string;
    /** 서비스 일자 (2025.05.30 (금)) */
    serviceDate: string;
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

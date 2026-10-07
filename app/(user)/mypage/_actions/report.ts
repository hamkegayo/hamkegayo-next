"use server";

import { getOwnReport, type CustomerReport } from "../_lib/report.server";

/**
 * 예약 상세에서 "리포트 보기"를 눌렀을 때만 불러온다 (#253).
 * 상세 화면은 15초마다 새로 고치므로, 페이지 로드에 붙이면 열람 기록이 계속 쌓인다.
 */
export async function loadOwnReport(
    reservationId: string,
): Promise<CustomerReport | null> {
    if (typeof reservationId !== "string" || !reservationId) return null;
    return getOwnReport(reservationId);
}

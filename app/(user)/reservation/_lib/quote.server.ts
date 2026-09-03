/**
 * 예약 견적(선결제액) 산정 — 서버 전용 (#46).
 *  - 공휴일 판정(API 호출)이 필요해 서버에서만 계산한다.
 *  - 예약 신청 화면의 예상비용과 예약 등록 시 저장하는 요금 스냅샷이 이 함수를 공유한다.
 */

import { isSurchargeDate } from "@/lib/holidays";
import {
    calcPrepayment,
    parseDurationMinutes,
    type Prepayment,
} from "@/lib/pricing";
import { PLAN_INFO, type PlanCode } from "@/lib/reservation";

export type ReservationQuote = Prepayment & {
    plan: PlanCode;
    /** 예약 시점의 시간당 기본요금 — 스냅샷으로 저장한다 */
    hourlyRate: number;
    /** 예약 시점의 플랫폼 수수료율 — 스냅샷으로 저장한다 */
    feeRate: number;
    /** 주말·공휴일 여부 (약관 제13조 ①) */
    isSurcharge: boolean;
};

/** duration 파싱 실패 시 null */
export async function quoteReservation(
    plan: PlanCode,
    useDate: string,
    duration: string,
): Promise<ReservationQuote | null> {
    const durationMinutes = parseDurationMinutes(duration);
    if (durationMinutes === null) return null;

    const isSurcharge = await isSurchargeDate(useDate);
    const prepayment = calcPrepayment(plan, durationMinutes, isSurcharge);

    return {
        ...prepayment,
        plan,
        hourlyRate: PLAN_INFO[plan].price,
        feeRate: PLAN_INFO[plan].feeRate,
        isSurcharge,
    };
}

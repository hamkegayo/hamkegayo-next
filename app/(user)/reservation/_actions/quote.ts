"use server";

import { quoteReservation, type ReservationQuote } from "../_lib/quote.server";
import type { PlanCode } from "@/lib/reservation";

/**
 * 예약 신청 화면 예상비용 조회 (#46).
 * 공휴일 판정이 서버에서만 가능하므로 클라이언트는 이 액션으로 견적을 받는다.
 */
export async function getReservationQuote(input: {
    plan: PlanCode;
    useDate: string;
    duration: string;
}): Promise<ReservationQuote | null> {
    if (!input?.useDate || !input?.duration) return null;
    if (input.plan !== "basic" && input.plan !== "plus") return null;

    return quoteReservation(input.plan, input.useDate, input.duration);
}

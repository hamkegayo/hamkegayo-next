/**
 * 서비스 종료 시 최종 이용요금 확정 (#46).
 *  - 실제 이용시간 → lib/pricing.ts 로 최종 요금을 산정하고 예약에 기록한다.
 *  - 정산(settlements)은 완료 시점의 DB 트리거가 이 값을 그대로 읽어간다.
 *
 *  RLS 상 파트너는 reservations 를 UPDATE 할 수 없으므로 admin 클라이언트로 쓴다.
 *  금액은 전적으로 서버에서 계산하며 클라이언트 입력을 받지 않는다.
 *  호출 전 end_service RPC 가 파트너 본인 여부를 이미 검증한다.
 */

import { createAdminClient } from "@/utils/supabase/admin";
import {
    MIN_BILLABLE_MIN,
    MIN_PREPAY_MIN,
    oneHourCharge,
    actualMinutesBetween,
    billingStartMs,
    calcFinalCharge,
    calcSettlementDiff,
    parseDurationMinutes,
    toEpochMs,
    type FinalCharge,
    type SettlementDiff,
} from "@/lib/pricing";
import type { PlanCode } from "@/lib/reservation";

export type FinalizeResult = {
    customerId: string;
    reservationId: string;
    /** 예약번호 — 추가결제 주문번호의 접두사가 된다 */
    reservationCode: string;
    /** 이용일("2026-09-05") — 결제 안내 문구에 쓴다 */
    useDate: string;
    charge: FinalCharge;
    prepaidAmount: number;
    diff: SettlementDiff;
};

type Row = {
    arrived_at: string | null;
    started_at: string | null;
    ended_at: string | null;
    reservation_id: string;
    reservations: {
        code: string;
        customer_id: string;
        plan: string;
        use_date: string;
        arrive_time: string;
        duration: string;
        duration_minutes: number | null;
        surcharge_rate: number | string | null;
        prepaid_amount: number | null;
    } | null;
};

/** ISO 문자열 → epoch ms (없거나 형식 오류면 null) */
function toMs(iso: string | null): number | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? null : ms;
}

/**
 * 종료된 서비스의 최종 이용요금을 산정해 예약에 저장한다.
 * 산정할 수 없으면(종료시각 없음 등) null 을 반환하고 아무것도 쓰지 않는다.
 */
export async function finalizeServiceCharge(
    serviceId: string,
): Promise<FinalizeResult | null> {
    try {
        const admin = createAdminClient();

        const { data, error } = await admin
            .from("services")
            .select(
                "arrived_at, started_at, ended_at, reservation_id, " +
                    "reservations!inner(code, customer_id, plan, use_date, arrive_time, duration, duration_minutes, surcharge_rate, prepaid_amount)",
            )
            .eq("id", serviceId)
            .maybeSingle<Row>();

        if (error || !data?.reservations) return null;

        const r = data.reservations;
        const endedAtMs = toMs(data.ended_at);
        if (endedAtMs === null) return null;

        const plan: PlanCode = r.plan === "plus" ? "plus" : "basic";
        const durationMinutes =
            r.duration_minutes ??
            parseDurationMinutes(r.duration) ??
            MIN_PREPAY_MIN;

        // 예약 시점에 고정한 할증률을 그대로 쓴다(공휴일 지정이 나중에 바뀌어도 흔들리지 않게).
        const isSurcharge = Number(r.surcharge_rate ?? 0) > 0;

        const startedAtMs = toMs(data.started_at);
        // 예약 시작 예정시각(파트너 도착 희망 시간). 파싱 실패 시 시작 버튼 시각으로 갈음.
        const plannedStartMs =
            toEpochMs(r.use_date, r.arrive_time) ?? startedAtMs ?? endedAtMs;

        const startMs = billingStartMs({
            plannedStartMs,
            arrivedAtMs: toMs(data.arrived_at),
            startedAtMs,
        });

        const charge = calcFinalCharge({
            plan,
            durationMinutes,
            actualMinutes: actualMinutesBetween(startMs, endedAtMs),
            isSurcharge,
        });

        const { error: updateError } = await admin
            .from("reservations")
            .update({
                billed_minutes: charge.billedMinutes,
                final_amount: charge.total,
            })
            .eq("id", data.reservation_id);

        if (updateError) {
            console.error("[finalizeServiceCharge] 저장 실패:", updateError);
            return null;
        }

        const prepaidAmount = r.prepaid_amount ?? 0;
        return {
            customerId: r.customer_id,
            reservationId: data.reservation_id,
            reservationCode: r.code,
            useDate: r.use_date,
            charge,
            prepaidAmount,
            diff: calcSettlementDiff(prepaidAmount, charge.total),
        };
    } catch (e) {
        console.error("[finalizeServiceCharge] 산정 실패:", e);
        return null;
    }
}

/**
 * 이용자 미도착(노쇼) 종료의 최종 이용요금을 확정한다 (#75 · 약관 제19조).
 *
 *  조문이 정한 것은 "해당 상품 1시간 이용요금 및 파트너 출동비용 실비" 다.
 *  🔸 출동비용 실비는 "회사가 별도로 정하여 안내" 로 남아 있어 아직 없다.
 *     정해지면 여기에 더한다.
 *
 *  선결제는 최소 2시간분이라 노쇼 청구(1시간)보다 크다. 그래서 실제로는
 *  **환불이 난다.** 그래도 같은 경로로 흘려보낸다 — 출동비용이 더해져
 *  선결제를 넘는 경우가 생기면 부호만 뒤집히면 되기 때문이다.
 */
export async function finalizeNoShowCharge(
    serviceId: string,
): Promise<FinalizeResult | null> {
    try {
        const admin = createAdminClient();

        const { data, error } = await admin
            .from("services")
            .select(
                "reservation_id, " +
                    "reservations!inner(code, customer_id, plan, use_date, surcharge_rate, prepaid_amount)",
            )
            .eq("id", serviceId)
            .maybeSingle<{
                reservation_id: string;
                reservations: {
                    code: string;
                    customer_id: string;
                    plan: string;
                    use_date: string;
                    surcharge_rate: number | string | null;
                    prepaid_amount: number | null;
                } | null;
            }>();

        if (error || !data?.reservations) return null;

        const r = data.reservations;
        const plan: PlanCode = r.plan === "plus" ? "plus" : "basic";
        const total = oneHourCharge(plan, Number(r.surcharge_rate ?? 0) > 0);

        const { error: updateError } = await admin
            .from("reservations")
            .update({ billed_minutes: MIN_BILLABLE_MIN, final_amount: total })
            .eq("id", data.reservation_id);

        if (updateError) {
            console.error("[finalizeNoShowCharge] 저장 실패:", updateError);
            return null;
        }

        const prepaidAmount = r.prepaid_amount ?? 0;
        return {
            customerId: r.customer_id,
            reservationId: data.reservation_id,
            reservationCode: r.code,
            useDate: r.use_date,
            charge: {
                actualMinutes: 0,
                baseMinutes: MIN_BILLABLE_MIN,
                extraMinutes: 0,
                billedMinutes: MIN_BILLABLE_MIN,
                baseAmount: total,
                extraAmount: 0,
                surchargeAmount: 0,
                surchargeRate: 0,
                total,
                minimumApplied: true,
            },
            prepaidAmount,
            diff: calcSettlementDiff(prepaidAmount, total),
        };
    } catch (e) {
        console.error("[finalizeNoShowCharge] 산정 실패:", e);
        return null;
    }
}

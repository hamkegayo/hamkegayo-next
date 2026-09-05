"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createNotification } from "@/lib/notifications";
import { enqueueSettlementRefund } from "@/lib/payments/settlement-refund";
import { finalizeServiceCharge } from "../../_lib/finalize-charge";
import { formatMinutes } from "@/lib/pricing";

export type ServiceActionResult = { ok: true } | { ok: false; message: string };

const ERROR_MESSAGE: Record<string, string> = {
    service_not_found: "서비스를 찾을 수 없습니다.",
    not_partner: "본인 서비스만 처리할 수 있습니다.",
    invalid_state: "지금은 처리할 수 없는 상태입니다.",
    already_arrived: "이미 도착이 기록되었습니다.",
    // 매뉴얼 4단계 — 일찍 도착해도 예약시각 정각에 시작한다.
    too_early: "예약시각 이후에 진행할 수 있습니다.",
    invalid_field: "기록할 수 없는 항목입니다.",
};

/** 서비스 행에 연결된 고객 id (알림 수신자) */
async function getCustomerId(serviceId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("services")
        .select("reservations!inner(customer_id)")
        .eq("id", serviceId)
        .maybeSingle<{ reservations: { customer_id: string } | null }>();
    return data?.reservations?.customer_id ?? null;
}

async function callRpc(
    fn:
        | "start_service"
        | "end_service"
        | "complete_service"
        | "arrive_service"
        | "record_service_time"
        | "end_service_no_show",
    args: Record<string, unknown>,
    serviceId: string,
): Promise<ServiceActionResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { error } = await supabase.rpc(fn, args);
    if (error) {
        const key = Object.keys(ERROR_MESSAGE).find((k) =>
            error.message.includes(k),
        );
        return {
            ok: false,
            message: key
                ? ERROR_MESSAGE[key]
                : "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    revalidatePath("/partner/management");
    revalidatePath(`/partner/management/${serviceId}`);
    return { ok: true };
}

/**
 * 현장 도착 통보 (상태 전이 없이 도착 시각만 기록).
 *  - 약관 제12조 ③ : 파트너 도착 시 예약자에게 도착 사실을 안내한다.
 *  - 약관 제16조 ① : 이 시각이 과금 시작 기준이 되어 파트너 지각분이 청구에서 빠진다.
 */
export async function arriveService(
    serviceId: string,
): Promise<ServiceActionResult> {
    const res = await callRpc(
        "arrive_service",
        { p_service_id: serviceId },
        serviceId,
    );
    if (res.ok) {
        const customerId = await getCustomerId(serviceId);
        if (customerId) {
            await createNotification(customerId, {
                type: "PARTNER_ARRIVED",
                title: "파트너가 도착했어요",
                body: "파트너가 약속 장소에 도착했습니다.",
                link: "/mypage/reservations",
            });
        }
    }
    return res;
}

/**
 * 진행 단계 시각 — 매뉴얼이 각 단계에서 기록하라고 정한 항목 (#55).
 *
 *  약관 제12조 ④ 는 이용시간 분쟁 시 "시작·종료시각 외에 도착 안내시각,
 *  서비스 진행기록" 을 함께 확인한다고 정한다. 그 자료가 이 값들이다.
 *
 *  라벨은 매뉴얼 단계 표현을 그대로 쓴다.
 */
export const SERVICE_TIME_FIELDS = [
    { field: "notified_at", label: "도착 통보", step: 4 },
    { field: "hospital_arrived_at", label: "병원 도착", step: 7 },
    { field: "reception_at", label: "접수 완료", step: 7 },
    { field: "wait_started_at", label: "대기 시작", step: 7 },
    { field: "wait_ended_at", label: "대기 종료", step: 7 },
    { field: "treatment_started_at", label: "진료·검사 시작", step: 8 },
    { field: "treatment_ended_at", label: "진료·검사 종료", step: 8 },
    { field: "checkout_started_at", label: "수납·약국 시작", step: 9 },
    { field: "checkout_ended_at", label: "수납·약국 종료", step: 9 },
    { field: "home_departed_at", label: "귀가 출발", step: 11 },
    { field: "handover_at", label: "인계 확인", step: 12 },
] as const;

export type ServiceTimeField = (typeof SERVICE_TIME_FIELDS)[number]["field"];

/**
 * 진행 시각을 기록한다. **시각은 서버가 찍는다** — 매뉴얼이 임의 시각 입력을
 * 금지하기 때문이다(4·13단계·대응카드 26). 두 번 눌러도 처음 시각이 남는다.
 */
export async function recordServiceTime(
    serviceId: string,
    field: ServiceTimeField,
): Promise<ServiceActionResult> {
    return callRpc(
        "record_service_time",
        { p_service_id: serviceId, p_field: field },
        serviceId,
    );
}

/**
 * 이용자 미도착 종료 — 약관 제15조 ③④ · 대응카드 03.
 *
 *  시작 후 20분이 지나야 호출할 수 있다. 그 전에 떠나는 것을 매뉴얼이
 *  금지하므로 서버가 거절한다.
 */
export async function endServiceNoShow(
    serviceId: string,
): Promise<ServiceActionResult> {
    const res = await callRpc(
        "end_service_no_show",
        { p_service_id: serviceId },
        serviceId,
    );

    if (res.ok) {
        const customerId = await getCustomerId(serviceId);
        if (customerId) {
            await createNotification(customerId, {
                type: "RESERVATION_CANCELLED",
                title: "약속 장소에서 만나지 못했어요",
                body: "파트너가 예약시각부터 20분간 기다린 뒤 종료했습니다. 자세한 내용은 고객센터로 문의해 주세요.",
                link: "/mypage/reservations",
            });
        }
    }
    return res;
}

/** 서비스 시작 (SCHEDULED → IN_PROGRESS) */
export async function startService(
    serviceId: string,
    memo?: string,
): Promise<ServiceActionResult> {
    return callRpc(
        "start_service",
        { p_service_id: serviceId, p_memo: memo?.trim() || null },
        serviceId,
    );
}

/**
 * 서비스 종료 (IN_PROGRESS → ENDED).
 * 종료 시각이 확정되므로 곧바로 최종 이용요금을 산정해 예약에 기록하고,
 * 환불/추가결제가 발생하면 고객에게 안내한다 (약관 제21조 ③④⑤ · 제22조 ①).
 */
export async function endService(
    serviceId: string,
    memo?: string,
): Promise<ServiceActionResult> {
    const res = await callRpc(
        "end_service",
        { p_service_id: serviceId, p_memo: memo?.trim() || null },
        serviceId,
    );
    if (!res.ok) return res;

    const final = await finalizeServiceCharge(serviceId);
    if (final) {
        const { charge, diff, customerId } = final;
        const usage = `이용시간 ${formatMinutes(charge.billedMinutes)} · 최종 요금 ${charge.total.toLocaleString()}원`;

        if (diff.additional > 0) {
            await createNotification(customerId, {
                type: "PAYMENT_ADDITIONAL",
                title: "추가 결제가 필요해요",
                body: `${usage}. ${diff.additional.toLocaleString()}원을 24시간 이내에 결제해 주세요.`,
                link: "/mypage/reservations",
            });
        } else if (diff.refund > 0) {
            // 미달분은 자동으로 나가지 않는다. 종료 시각이 잘못 눌렸을 수 있어
            // 관리자가 한 번 확인한 뒤 집행한다(#76, 2026-09-05 기획 확정).
            await enqueueSettlementRefund({
                reservationId: final.reservationId,
                amount: diff.refund,
                reason: usage,
            });

            await createNotification(customerId, {
                type: "PAYMENT_REFUND",
                title: "결제 금액이 환불될 예정이에요",
                body: `${usage}. 선결제 금액 중 ${diff.refund.toLocaleString()}원을 확인 후 환불해 드립니다. 완료되면 다시 알려드릴게요.`,
                link: "/mypage/reservations",
            });
        }
    }

    return res;
}

/** 서비스 완료 (ENDED → COMPLETED, 예약도 COMPLETED) */
export async function completeService(
    serviceId: string,
): Promise<ServiceActionResult> {
    const res = await callRpc(
        "complete_service",
        { p_service_id: serviceId },
        serviceId,
    );
    if (res.ok) {
        const customerId = await getCustomerId(serviceId);
        if (customerId) {
            await createNotification(customerId, {
                type: "SERVICE_COMPLETED",
                title: "서비스가 완료되었어요",
                body: "동행이 안전하게 마무리됐어요. 이용 후기를 남겨주세요.",
                link: "/review/write",
            });
        }
    }
    return res;
}

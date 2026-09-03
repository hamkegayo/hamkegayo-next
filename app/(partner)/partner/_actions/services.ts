"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createNotification } from "@/lib/notifications";
import { finalizeServiceCharge } from "../../_lib/finalize-charge";
import { formatMinutes } from "@/lib/pricing";

export type ServiceActionResult = { ok: true } | { ok: false; message: string };

const ERROR_MESSAGE: Record<string, string> = {
    service_not_found: "서비스를 찾을 수 없습니다.",
    not_partner: "본인 서비스만 처리할 수 있습니다.",
    invalid_state: "지금은 처리할 수 없는 상태입니다.",
    already_arrived: "이미 도착이 기록되었습니다.",
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
    fn: "start_service" | "end_service" | "complete_service" | "arrive_service",
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
            await createNotification(customerId, {
                type: "PAYMENT_REFUND",
                title: "결제 금액이 환불될 예정이에요",
                body: `${usage}. 선결제 금액 중 ${diff.refund.toLocaleString()}원을 환불해 드립니다.`,
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

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createNotification } from "@/lib/notifications";

export type ServiceActionResult = { ok: true } | { ok: false; message: string };

const ERROR_MESSAGE: Record<string, string> = {
    service_not_found: "서비스를 찾을 수 없습니다.",
    not_partner: "본인 서비스만 처리할 수 있습니다.",
    invalid_state: "지금은 처리할 수 없는 상태입니다.",
};

async function callRpc(
    fn: "start_service" | "end_service" | "complete_service",
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

/** 서비스 종료 (IN_PROGRESS → ENDED) */
export async function endService(
    serviceId: string,
    memo?: string,
): Promise<ServiceActionResult> {
    return callRpc(
        "end_service",
        { p_service_id: serviceId, p_memo: memo?.trim() || null },
        serviceId,
    );
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
        const supabase = await createClient();
        const { data } = await supabase
            .from("services")
            .select("reservations!inner(customer_id)")
            .eq("id", serviceId)
            .maybeSingle<{ reservations: { customer_id: string } | null }>();
        const customerId = data?.reservations?.customer_id;
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

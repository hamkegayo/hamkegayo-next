import { createAdminClient } from "@/utils/supabase/admin";
import { createNotification } from "@/lib/notifications";

/**
 * 종료 후 미달분 환불 (#76) — 약관 제21조 ④.
 *
 *  **자동으로 내보내지 않는다** (2026-09-05 기획 확정).
 *    미달분은 파트너가 누른 종료 시각으로 계산된다. 시각을 잘못 눌렀거나
 *    현장에서 다툼이 있으면 틀린 금액이 그대로 나간다. 나간 돈은 되돌리기
 *    어려우므로 사람이 한 번 보고 내보낸다.
 *
 *  고객에게는 종료 시점에 "환불 예정" 을 안내하고(services.ts), 실제로
 *  나간 뒤 한 번 더 알린다.
 */

/** 관리자 전원에게 알린다 — 승인할 사람이 알아야 큐가 흐른다 */
async function notifyAdmins(title: string, body: string, link: string) {
    try {
        const admin = createAdminClient();
        const { data: admins } = await admin
            .from("profiles")
            .select("id")
            .eq("role", "ADMIN")
            .eq("status", "ACTIVE");

        await Promise.all(
            (admins ?? []).map((a) =>
                createNotification(a.id, {
                    type: "PAYMENT_REFUND",
                    title,
                    body,
                    link,
                }),
            ),
        );
    } catch (e) {
        // 알림 실패가 환불 요청 적재를 막지 않는다.
        console.error("[settlement-refund] 관리자 알림 실패:", e);
    }
}

/**
 * 미달분 환불을 승인 큐에 넣는다. 서비스 종료 직후 호출한다.
 *
 *  실패해도 예외를 던지지 않는다 — 종료 처리 자체를 막으면 안 된다.
 *  다만 큐에 못 들어가면 환불이 영영 안 나가므로 로그는 남긴다.
 */
export async function enqueueSettlementRefund(params: {
    reservationId: string;
    reservationCode?: string | null;
    amount: number;
    reason?: string;
}): Promise<void> {
    if (params.amount <= 0) return;

    try {
        const admin = createAdminClient();
        const exception = await admin
            .from("services")
            .select("termination_kind")
            .eq("reservation_id", params.reservationId)
            .maybeSingle();
        if (
            exception.error ||
            ["PROVIDER_FAULT", "EMERGENCY"].includes(
                exception.data?.termination_kind,
            )
        )
            return;
        const { data, error } = await admin.rpc("request_settlement_refund", {
            p_reservation_id: params.reservationId,
            p_amount: params.amount,
            p_reason: params.reason ?? "서비스 종료 후 미달분",
        });

        if (error) {
            console.error("[settlement-refund] 적재 실패:", error);
            return;
        }
        if (!data) return; // 선결제가 없는 건

        await notifyAdmins(
            "환불 승인이 필요해요",
            `예약 ${params.reservationCode ?? params.reservationId} · ${params.amount.toLocaleString()}원 미달분 환불이 승인 대기 중입니다.`,
            "/admin",
        );
    } catch (e) {
        console.error("[settlement-refund] 적재 예외:", e);
    }
}

export type ExecuteRefundResult =
    | { ok: true; amount: number; already: boolean }
    | { ok: false; message: string };

/** @deprecated 직접 PG 재호출을 금지한다. MFA 관리자 승인/결과 조회 경로를 사용한다. */
export async function executeApprovedRefund(
    _requestId: string,
): Promise<ExecuteRefundResult> {
    void _requestId;
    return {
        ok: false,
        message:
            "관리자 미달분 환불 화면에서 승인 또는 결과 조회를 진행해 주세요.",
    };
}

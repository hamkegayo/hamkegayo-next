import { createAdminClient } from "@/utils/supabase/admin";
import { getPaymentGateway } from "@/lib/payments/nicepay";
import { reportIncident } from "@/lib/payments/incident";
import { PaymentGatewayError } from "@/lib/payments/types";
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

/**
 * 승인된 미달분 환불을 실제로 집행한다.
 *
 *  ⚠️ 승인 여부는 호출부(관리자 화면)가 `admin_decide_refund_request` 로
 *     먼저 기록해야 한다. 이 함수는 APPROVED 상태만 집행한다.
 *
 *  취소 환불과 같은 순서다 — **PG 를 먼저 부르고 DB 를 기록한다.**
 *  선결제 전액이 아니라 일부만 돌려주므로 반드시 부분취소다.
 *  ⚠️ 나이스페이 샌드박스는 부분취소를 지원하지 않아 운영 키에서만 확인된다.
 */
export async function executeApprovedRefund(
    requestId: string,
): Promise<ExecuteRefundResult> {
    const admin = createAdminClient();

    const { data: req } = await admin
        .from("refund_requests")
        .select(
            "id, amount, status, reservation_id, " +
                "payments!refund_requests_payment_id_fkey(id, order_id, transaction_id), " +
                "reservations!inner(code)",
        )
        .eq("id", requestId)
        .maybeSingle<{
            id: string;
            amount: number;
            status: string;
            reservation_id: string;
            payments: {
                id: string;
                order_id: string;
                transaction_id: string | null;
            } | null;
            reservations: { code: string } | null;
        }>();

    if (!req) return { ok: false, message: "환불 요청을 찾을 수 없습니다." };
    if (req.status === "COMPLETED") {
        return { ok: true, amount: req.amount, already: true };
    }
    if (req.status !== "APPROVED") {
        return { ok: false, message: "승인된 환불 요청이 아닙니다." };
    }

    const payment = req.payments;
    if (!payment?.transaction_id) {
        return { ok: false, message: "PG 거래번호가 없어 환불할 수 없습니다." };
    }

    // ---------- ① PG 부분취소 ----------
    let raw: unknown = null;
    try {
        const result = await getPaymentGateway().cancel({
            transactionId: payment.transaction_id,
            orderId: payment.order_id,
            reason: "서비스 종료 후 미달분 환불",
            amount: req.amount,
        });
        raw = result.raw ?? null;
    } catch (e) {
        const err = e instanceof PaymentGatewayError ? e : null;
        await reportIncident({
            kind: "REFUND_FAILED",
            orderId: payment.order_id,
            paymentId: payment.id,
            reservationCode: req.reservations?.code ?? null,
            amount: req.amount,
            detail: {
                stage: "SETTLEMENT_REFUND",
                gatewayCode: err?.code ?? null,
                gatewayMessage: err?.message ?? String(e),
                indeterminate: err?.indeterminate ?? false,
            },
        });
        return {
            ok: false,
            message: "PG 취소에 실패했습니다. 승인 상태는 그대로 두었습니다.",
        };
    }

    // ---------- ② 기록 ----------
    const { data, error } = await admin.rpc("record_settlement_refund", {
        p_request_id: requestId,
        p_raw: raw as never,
    });

    if (error) {
        await reportIncident({
            kind: "REFUND_RECORD_FAILED",
            orderId: payment.order_id,
            paymentId: payment.id,
            reservationCode: req.reservations?.code ?? null,
            amount: req.amount,
            detail: { stage: "SETTLEMENT_REFUND", dbError: error.message },
        });
        return {
            ok: false,
            message:
                "환불은 나갔으나 기록에 실패했습니다. 재시도하지 마세요 — 두 번 나갑니다.",
        };
    }

    const summary = data as { already: boolean };

    // 고객에게 실제 환불 완료를 알린다(종료 시점의 "예정" 안내와 별개).
    const { data: res } = await admin
        .from("reservations")
        .select("customer_id")
        .eq("id", req.reservation_id)
        .maybeSingle();

    if (res?.customer_id && !summary.already) {
        await createNotification(res.customer_id, {
            type: "PAYMENT_REFUND",
            title: "환불이 완료되었어요",
            body: `${req.amount.toLocaleString()}원이 결제하신 수단으로 환불되었습니다. 카드사에 따라 반영까지 며칠 걸릴 수 있어요.`,
            link: `/mypage/reservations/${req.reservation_id}`,
        });
    }

    return { ok: true, amount: req.amount, already: summary.already };
}

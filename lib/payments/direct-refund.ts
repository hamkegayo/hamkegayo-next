import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/utils/supabase/admin";
import { getPaymentGateway } from "@/lib/payments/nicepay";
import { reportIncident } from "@/lib/payments/incident";
import { PaymentGatewayError } from "@/lib/payments/types";

/**
 * 배정 전 전액 환불 (#300) — 고객 취소·운영자 매칭 실패.
 *
 *  ⚠️ 약관: 배정 전 전액 환불은 제19조 취소수수료 표와 별개의 운영 기준(사용자 확정 2026-11-19)이다.
 *     현재 공개 약관에 근거 조항이 없다. 구현 우선 진행, 추후 정책 개선 예정 — 출시 전 개정·고지 필요.
 *
 *  흐름 (단계마다 DB 에 상태가 남아 어디서 끊겨도 이어서 할 수 있다)
 *    ① begin   RPC(고객 customer_cancel_before_assignment / 관리자 admin_fail_matching) —
 *              예약 행을 잠가 CANCELLED 로 닫고 환불 행(REQUESTED)을 만든다. 배정과 경쟁하면 한쪽만 성립한다.
 *    ② claim   임대(3분)를 잡는다 — 같은 환불의 동시 PG 호출(중복 환불)을 막는다.
 *    ③ PG 취소 전액 취소. 성공하면 pg_cancelled_at 을 남긴다. 실패하면 PG_FAILED(재시도 대상)로 둔다.
 *    ④ complete 원장 기록(REFUND 행·포인트 전액 복원·쿠폰 복원) — 여기까지 끝나야 REFUNDED(환불 완료)다.
 *
 *  PG 취소가 실패하면 환불 완료로 표시하지 않는다. 예약은 닫혀 있지만 환불은 "처리 중/실패" 로 남고,
 *  운영자는 관리자 환불 추적 목록에서 보고 재시도(admin_retry_direct_refund)한다. PG 는 성공했는데
 *  ④ 가 실패한 경우 재시도는 PG 를 다시 부르지 않고 ④ 만 한다(pg_cancelled_at).
 */

export type DirectRefundOutcome =
    | {
          ok: true;
          cash: number;
          restoredPoints: number;
          couponRestored: boolean;
          couponRestoreSkipped: boolean;
          /** 이미 완료된 건이라 새로 한 것이 없다 */
          already: boolean;
      }
    | {
          ok: false;
          code:
              "IN_PROGRESS" | "GATEWAY_FAILED" | "RECORD_FAILED" | "NOT_FOUND";
          message: string;
      };

type Claim = {
    proceed: boolean;
    status: string;
    pg_done?: boolean;
    amount_cash?: number;
    full_cash?: number;
    order_id?: string;
    transaction_id?: string | null;
    payment_id?: string;
    reservation_id?: string;
    reservation_code?: string;
};

/** 환불 행 하나를 끝까지 진행한다. 던지지 않는다. */
export async function executeDirectRefund(
    refundId: string,
    reason: string,
): Promise<DirectRefundOutcome> {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("claim_direct_refund", {
        p_refund: refundId,
    });
    if (error || !data) {
        return {
            ok: false,
            code: "NOT_FOUND",
            message: "환불 정보를 찾을 수 없습니다.",
        };
    }
    const claim = data as Claim;
    if (!claim.proceed) {
        if (claim.status === "REFUNDED")
            return {
                ok: true,
                cash: 0,
                restoredPoints: 0,
                couponRestored: false,
                couponRestoreSkipped: false,
                already: true,
            };
        return {
            ok: false,
            code: "IN_PROGRESS",
            message: "환불을 처리하고 있습니다. 잠시 후 다시 확인해 주세요.",
        };
    }

    const cash = claim.amount_cash ?? 0;

    // ---------- ③ PG 취소 ----------
    if (cash > 0 && !claim.pg_done) {
        if (!claim.transaction_id) {
            await admin.rpc("fail_direct_refund", {
                p_refund: refundId,
                p_error: "PG 거래번호가 없어 취소할 수 없습니다",
            });
            await reportIncident({
                kind: "REFUND_FAILED",
                orderId: claim.order_id,
                paymentId: claim.payment_id,
                reservationCode: claim.reservation_code,
                amount: cash,
                detail: { reason: "NO_TRANSACTION_ID", direct: true },
            });
            return gatewayFailed();
        }
        try {
            const result = await getPaymentGateway().cancel({
                transactionId: claim.transaction_id,
                orderId: claim.order_id!,
                reason,
                // 전액 취소 — 금액을 싣지 않는다(나이스페이는 cancelAmt 가 없으면 전액취소).
            });
            const { error: markError } = await admin.rpc(
                "mark_direct_refund_pg_done",
                { p_refund: refundId, p_raw: (result.raw ?? null) as never },
            );
            if (markError) {
                // PG 취소는 끝났는데 표시를 못 남겼다. 계속 진행하고(④ 가 원장에 기록한다) 사고로 남긴다.
                await reportIncident({
                    kind: "REFUND_RECORD_FAILED",
                    orderId: claim.order_id,
                    paymentId: claim.payment_id,
                    reservationCode: claim.reservation_code,
                    amount: cash,
                    detail: {
                        dbError: markError.message,
                        step: "mark_pg_done",
                    },
                });
            }
        } catch (e) {
            const err = e instanceof PaymentGatewayError ? e : null;
            await admin.rpc("fail_direct_refund", {
                p_refund: refundId,
                p_error: `${err?.code ?? "PG"}: ${err?.message ?? String(e)}`,
            });
            await reportIncident({
                kind: "REFUND_FAILED",
                orderId: claim.order_id,
                paymentId: claim.payment_id,
                reservationCode: claim.reservation_code,
                amount: cash,
                detail: {
                    gatewayCode: err?.code ?? null,
                    gatewayMessage: err?.message ?? String(e),
                    indeterminate: err?.indeterminate ?? false,
                    direct: true,
                },
            });
            return gatewayFailed();
        }
    }

    // ---------- ④ 원장 기록 ----------
    const { data: done, error: completeError } = await admin.rpc(
        "complete_direct_refund",
        { p_refund: refundId },
    );
    if (completeError || !done) {
        // 돈은 이미 나갔다. 상태를 PG_FAILED(+RECORD_FAILED 사유)로 돌려 재시도가 ④ 만 하게 하고 사고로 남긴다.
        await admin.rpc("fail_direct_refund", {
            p_refund: refundId,
            p_error: `RECORD_FAILED: ${completeError?.message ?? "no result"}`,
        });
        await reportIncident({
            kind: "REFUND_RECORD_FAILED",
            orderId: claim.order_id,
            paymentId: claim.payment_id,
            reservationCode: claim.reservation_code,
            amount: cash,
            detail: { dbError: completeError?.message ?? null, direct: true },
        });
        return {
            ok: false,
            code: "RECORD_FAILED",
            message:
                "환불은 요청되었으나 처리 중 오류가 발생했습니다. 고객센터로 문의해 주세요.",
        };
    }

    const summary = done as {
        already: boolean;
        cash: number;
        restored_points?: number;
        coupon_restored?: boolean;
        coupon_restore_skipped?: boolean;
    };
    return {
        ok: true,
        cash: summary.cash,
        restoredPoints: summary.restored_points ?? 0,
        couponRestored: summary.coupon_restored === true,
        couponRestoreSkipped: summary.coupon_restore_skipped === true,
        already: summary.already,
    };
}

function gatewayFailed(): DirectRefundOutcome {
    return {
        ok: false,
        code: "GATEWAY_FAILED",
        message: "환불 처리에 실패했습니다. 운영팀이 확인해 다시 처리합니다.",
    };
}

type BeginResult = { refund_id: string; status: string };

/**
 * 고객이 배정 전 예약을 취소한다. `supabase` 는 **고객 세션 클라이언트**여야 한다(RPC 가 auth.uid() 로 소유를 검증).
 * 이미 환불 행이 있으면(재요청·PG 실패 후 재시도) 같은 환불을 이어서 처리한다.
 */
export async function cancelBeforeAssignment(
    supabase: SupabaseClient,
    reservationId: string,
): Promise<
    | { ok: false; message: string }
    | { ok: true; refund: DirectRefundOutcome; refundId: string }
> {
    const { data, error } = await supabase.rpc(
        "customer_cancel_before_assignment",
        { p_reservation: reservationId },
    );
    if (error || !data) {
        return {
            ok: false,
            message:
                error?.code === "23514"
                    ? "이미 파트너가 배정되었거나 취소할 수 없는 예약입니다."
                    : "취소에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }
    const { refund_id } = data as BeginResult;
    const refund = await executeDirectRefund(
        refund_id,
        "배정 전 고객 예약 취소",
    );
    return { ok: true, refund, refundId: refund_id };
}

/**
 * 운영자 매칭 실패 처리 + 전액 환불. `supabase` 는 **관리자 세션 클라이언트**여야 한다
 * (RPC 가 can_manage_reservations() 로 권한을 검증하고 수행자를 기록한다).
 */
export async function failMatchingAndRefund(
    supabase: SupabaseClient,
    reservationId: string,
    reason: string,
): Promise<
    | { ok: false; message: string }
    | { ok: true; refund: DirectRefundOutcome; refundId: string }
> {
    const { data, error } = await supabase.rpc("admin_fail_matching", {
        p_reservation: reservationId,
        p_reason: reason,
    });
    if (error || !data) {
        return {
            ok: false,
            message:
                error?.code === "42501"
                    ? "권한이 없습니다."
                    : error?.code === "23514"
                      ? "배정 전 매칭 대기 예약만 매칭 실패로 처리할 수 있습니다."
                      : "매칭 실패 처리에 실패했습니다.",
        };
    }
    const { refund_id } = data as BeginResult;
    const refund = await executeDirectRefund(refund_id, "매칭 실패 전액 환불");
    return { ok: true, refund, refundId: refund_id };
}

/**
 * 실패·중단된 환불을 운영자가 다시 시도한다. 관리자 RPC 가 권한·상태를 검증한 뒤 같은 실행 경로를 탄다.
 * 임대가 살아 있으면(다른 요청이 처리 중) 거절되어 중복 환불이 생기지 않는다.
 */
export async function retryDirectRefund(
    supabase: SupabaseClient,
    reservationId: string,
): Promise<
    | { ok: false; message: string }
    | { ok: true; refund: DirectRefundOutcome; refundId: string }
> {
    const { data, error } = await supabase.rpc("admin_retry_direct_refund", {
        p_reservation: reservationId,
    });
    if (error || !data) {
        return {
            ok: false,
            message:
                error?.code === "23514"
                    ? "다른 요청이 환불을 처리하고 있습니다. 잠시 후 다시 확인해 주세요."
                    : "환불 재시도에 실패했습니다.",
        };
    }
    const refundId = data as unknown as string;
    const refund = await executeDirectRefund(refundId, "환불 재시도");
    return { ok: true, refund, refundId };
}

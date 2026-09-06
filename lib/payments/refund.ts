import { createAdminClient } from "@/utils/supabase/admin";
import { getPaymentGateway } from "@/lib/payments/nicepay";
import { reportIncident } from "@/lib/payments/incident";
import { PaymentGatewayError } from "@/lib/payments/types";
import {
    calcCancelFee,
    toEpochMs,
    type CancelFee,
    type CancelFeeBracket,
} from "@/lib/pricing";
import type { PlanCode } from "@/lib/reservation";

/**
 * 예약 취소 환불 (#76) — 약관 제19조.
 *
 *  순서가 중요하다. **PG 취소를 먼저 하고 DB 를 기록한다.**
 *    DB 를 먼저 쓰면 PG 취소가 실패했을 때 "환불됨" 이라고 표시된 채 돈은
 *    그대로 남는다. 고객이 환불받았다고 믿게 되는 쪽이 훨씬 나쁘다.
 *    반대 순서의 실패(PG 성공 + DB 실패)는 사고로 남기고 사람이 정리한다.
 *
 *  ⚠️ 서비스 시작 **전** 취소만 다룬다. 조기 종료·노쇼·이용자 귀책 중단은
 *     제17조·제21조가 금액을 정하는 정산 경로이고 #55 가 선행이다.
 */

export type RefundOutcome =
    | {
          ok: true;
          /** PG 로 돌려준 현금(원). 0 이면 PG 호출 없이 기록만 했다 */
          cash: number;
          /** 환불하지 않고 남긴 금액(원) — 제19조 ② */
          cancelFee: number;
          /** 복원된 포인트(원) */
          restoredPoints: number;
          bracket: CancelFeeBracket;
          /** 이미 처리된 건이라 아무것도 새로 하지 않았다 */
          already: boolean;
      }
    | { ok: false; code: RefundErrorCode; message: string };

export type RefundErrorCode =
    /** 환불할 결제가 없다 — 선결제 전 예약이면 정상적인 경우다 */
    | "NO_PAYMENT"
    /** PG 취소 실패 — 아무것도 바뀌지 않았다 */
    | "GATEWAY_FAILED"
    /** PG 취소는 됐는데 기록에 실패 — 사람이 정리해야 한다 */
    | "RECORD_FAILED";

type PaymentRow = {
    id: string;
    order_id: string;
    transaction_id: string | null;
    gross_amount: number;
    discount_amount: number;
    reservations: {
        code: string;
        plan: string;
        use_date: string;
        arrive_time: string;
        surcharge_rate: number | string | null;
    } | null;
};

/**
 * 취소 전 안내에 쓸 예상 환불 내역 (#76).
 *
 *  약관 제19조의 표는 공개돼 있지만, **취소 버튼 앞에서 자기 건이 어느
 *  구간인지 아는 사람은 없다.** 2시간 전 이내면 한 시간 요금이 남는데
 *  그것을 모른 채 누르게 두면 안 된다.
 *
 *  ⚠️ 실제 환불(`refundReservationPayment`)과 **같은 함수로 계산한다.**
 *     안내와 집행이 갈라지면 안내가 거짓말이 된다.
 */
export type RefundPreview = {
    /** 선결제한 현금(원) — 포인트 할인분은 빠져 있다 */
    paidCash: number;
    /** 사용했던 포인트(원). 취소수수료와 무관하게 전액 복원된다 */
    usedPoints: number;
    /** 환불하지 않고 남기는 금액(원) — 제19조 ② */
    cancelFee: number;
    /** 실제로 돌려받는 현금(원) */
    refundCash: number;
    bracket: CancelFeeBracket;
    /** 시작 예정시각까지 남은 분. 음수면 예정시각이 지났다 */
    minutesUntilStart: number;
};

/** 환불 대상 선결제 행. 없으면 null — 선결제 전 예약이 그렇다. */
async function loadBasePayment(
    admin: ReturnType<typeof createAdminClient>,
    reservationId: string,
): Promise<PaymentRow | null> {
    const { data } = await admin
        .from("payments")
        .select(
            "id, order_id, transaction_id, gross_amount, discount_amount, " +
                "reservations!inner(code, plan, use_date, arrive_time, surcharge_rate)",
        )
        .eq("reservation_id", reservationId)
        .eq("type", "BASE")
        .eq("status", "PAID")
        .maybeSingle<PaymentRow>();

    return data ?? null;
}

/**
 * 취소했을 때 얼마가 돌아오는지 미리 계산한다. 아무것도 바꾸지 않는다.
 *
 *  ⚠️ 호출부가 **소유권을 먼저 확인해야 한다.** 금액은 본인만 볼 정보다.
 */
export async function previewCancelRefund(
    reservationId: string,
    options: { providerFault?: boolean } = {},
): Promise<RefundPreview | null> {
    const payment = await loadBasePayment(createAdminClient(), reservationId);
    if (!payment) return null;

    const fee = feeFor(payment, options.providerFault === true);
    const paidCash = payment.gross_amount - payment.discount_amount;

    return {
        paidCash,
        usedPoints: payment.discount_amount,
        cancelFee: fee.amount,
        refundCash: Math.max(0, paidCash - fee.amount),
        bracket: fee.bracket,
        minutesUntilStart: fee.minutesUntilStart,
    };
}

/** 예약 정보로 제19조 취소수수료를 산정한다 */
function feeFor(row: PaymentRow, providerFault: boolean): CancelFee {
    const r = row.reservations;
    const plan: PlanCode = r?.plan === "plus" ? "plus" : "basic";

    // 시작 예정시각을 못 읽으면 임박한 것으로 본다 — 고객에게 불리한 쪽이라
    // 파싱 실패가 무료취소로 새지 않게 한다. 실제로는 예약 생성 시 검증된다.
    const startAtMs = r ? toEpochMs(r.use_date, r.arrive_time) : null;

    return calcCancelFee({
        plan,
        startAtMs: startAtMs ?? Date.now(),
        nowMs: Date.now(),
        isSurcharge: Number(r?.surcharge_rate ?? 0) > 0,
        providerFault,
    });
}

/**
 * 확정 예약의 선결제를 환불한다.
 *
 *  결제가 없으면 `NO_PAYMENT` 를 돌려준다 — 호출부는 이것을 실패로 다루지 말고
 *  "환불할 것이 없는 취소" 로 이어가야 한다(선결제 전 취소가 그렇다).
 *
 *  @param providerFault 회사·파트너 귀책이면 취소수수료를 받지 않는다
 */
export async function refundReservationPayment(
    reservationId: string,
    options: { providerFault?: boolean; memo?: string } = {},
): Promise<RefundOutcome> {
    const admin = createAdminClient();
    const payment = await loadBasePayment(admin, reservationId);

    if (!payment) {
        return {
            ok: false,
            code: "NO_PAYMENT",
            message: "환불할 결제가 없습니다.",
        };
    }

    const fee = feeFor(payment, options.providerFault === true);
    const paidCash = payment.gross_amount - payment.discount_amount;
    const cash = Math.max(0, paidCash - fee.amount);

    // ---------- ① PG 취소 ----------
    let raw: unknown = null;
    if (cash > 0 && payment.transaction_id) {
        try {
            const result = await getPaymentGateway().cancel({
                transactionId: payment.transaction_id,
                orderId: payment.order_id,
                reason: options.memo ?? "고객 예약 취소",
                // 전액이면 금액을 싣지 않는다. 나이스페이는 cancelAmt 가 없으면 전액취소다.
                ...(cash < paidCash ? { amount: cash } : {}),
            });
            raw = result.raw ?? null;
        } catch (e) {
            const err = e instanceof PaymentGatewayError ? e : null;
            await reportIncident({
                kind: "REFUND_FAILED",
                orderId: payment.order_id,
                paymentId: payment.id,
                reservationCode: payment.reservations?.code ?? null,
                amount: cash,
                detail: {
                    gatewayCode: err?.code ?? null,
                    gatewayMessage: err?.message ?? String(e),
                    partial: cash < paidCash,
                    indeterminate: err?.indeterminate ?? false,
                },
            });
            return {
                ok: false,
                code: "GATEWAY_FAILED",
                message: "환불 처리에 실패했습니다. 고객센터로 문의해 주세요.",
            };
        }
    }

    // ---------- ② 기록 ----------
    const { data, error } = await admin.rpc("refund_payment", {
        p_payment_id: payment.id,
        p_cancel_fee: fee.amount,
        p_expected_cash: cash,
        p_memo: options.memo ?? "예약 취소 환불",
        p_raw: raw as never,
    });

    if (error) {
        // 돈은 이미 나갔다. 재시도하면 두 번 나가므로 사람이 정리해야 한다.
        await reportIncident({
            kind: "REFUND_RECORD_FAILED",
            orderId: payment.order_id,
            paymentId: payment.id,
            reservationCode: payment.reservations?.code ?? null,
            amount: cash,
            detail: { dbError: error.message, cancelFee: fee.amount },
        });
        return {
            ok: false,
            code: "RECORD_FAILED",
            message:
                "환불은 요청되었으나 처리 중 오류가 발생했습니다. 고객센터로 문의해 주세요.",
        };
    }

    const summary = data as {
        already: boolean;
        cash: number;
        cancel_fee: number;
        restored_points: number;
    };

    return {
        ok: true,
        cash: summary.cash,
        cancelFee: summary.cancel_fee,
        restoredPoints: summary.restored_points,
        bracket: fee.bracket,
        already: summary.already,
    };
}

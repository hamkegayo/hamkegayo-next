import { NextResponse, type NextRequest } from "next/server";

import { getPaymentGateway, parseAuthResult } from "@/lib/payments/nicepay";
import { PaymentGatewayError } from "@/lib/payments/types";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 선결제 승인 (#53) — NICEPAY 결제창이 인증 결과를 POST 하는 지점이다.
 *
 *  ⚠️ 인증(authResultCode=0000)만으로는 돈이 빠지지 않는다. 이 라우트가 승인 API 를
 *     부르는 순간 실제 청구가 일어난다. 그래서 부르기 **전에** 전부 확인한다.
 *
 *  순서 — 바꾸면 구멍이 생긴다
 *    ① signature 검증        위변조된 인증 결과를 걸러낸다
 *    ② 결제 행 조회          orderId 로 우리가 만든 PENDING 을 찾는다
 *    ③ 금액 대조             결제창 금액 vs DB 금액. 다르면 승인하지 않는다
 *    ④ 만료·재선택 재확인    선택이 풀렸으면 승인하지 않는다
 *    ⑤ PG 승인               ← 여기서 돈이 빠진다
 *    ⑥ finalize_payment()    PAID 전이 + 예약 확정을 한 트랜잭션에
 *    ⑦ 실패 시 승인 취소 + 포인트 복원
 *
 *  브라우저가 POST 로 이동해 오므로 응답은 JSON 이 아니라 **redirect** 다.
 */
export const dynamic = "force-dynamic";

/** 결과 화면으로 보낸다. 실패 사유는 코드로만 넘기고 상세는 서버 로그에 남긴다. */
function redirectTo(
    request: NextRequest,
    path: string,
    params: Record<string, string>,
) {
    const url = new URL(path, request.nextUrl.origin);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    // 303 — POST 를 GET 으로 바꿔 이동시킨다(새로고침 시 재전송 방지).
    return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
    const form = await request.formData().catch(() => null);

    if (!form) {
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: "BAD_REQUEST",
        });
    }

    const auth = parseAuthResult(form);
    const admin = createAdminClient();

    // 결제창에서 사용자가 취소했거나 인증이 실패한 경우 — 돈은 나가지 않았다.
    if (!auth.ok || !auth.transactionId || !auth.orderId) {
        console.warn(
            `[payments/confirm] 인증 실패 code=${auth.code} msg=${auth.message} order=${auth.orderId ?? "-"}`,
        );
        if (auth.orderId)
            await cancelPending(admin, auth.orderId, "결제창 인증 실패");
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: auth.code || "AUTH_FAILED",
        });
    }

    const gateway = getPaymentGateway();

    // ---------- ① signature 검증 ----------
    if (!gateway.verifyAuthResult(auth)) {
        console.error(
            `[payments/confirm] signature 불일치 order=${auth.orderId} tid=${auth.transactionId}`,
        );
        await cancelPending(admin, auth.orderId, "signature 검증 실패");
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: "INVALID_SIGNATURE",
        });
    }

    // ---------- ② 결제 행 조회 ----------
    const { data: payment } = await admin
        .from("payments")
        .select(
            "id, reservation_id, status, gross_amount, discount_amount, reservations!inner(id, code, status, confirmed_partner_id, payment_deadline)",
        )
        .eq("order_id", auth.orderId)
        .maybeSingle();

    if (!payment) {
        // 우리가 만들지 않은 주문번호다. 승인하지 않고 즉시 망취소한다.
        console.error(
            `[payments/confirm] 알 수 없는 주문번호 order=${auth.orderId}`,
        );
        await netCancelQuietly(auth.orderId);
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: "UNKNOWN_ORDER",
        });
    }

    const reservation = payment.reservations as unknown as {
        id: string;
        code: string;
        status: string;
        confirmed_partner_id: string | null;
        payment_deadline: string | null;
    };

    // 이미 승인이 끝난 결제 — 새로고침이나 중복 전송이다. 성공 화면으로 보낸다.
    if (payment.status === "PAID") {
        return redirectTo(request, "/mypage/reservations", {
            pay: "done",
            code: reservation.code,
        });
    }

    if (payment.status !== "PENDING") {
        await netCancelQuietly(auth.orderId);
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: "PAYMENT_NOT_PENDING",
        });
    }

    // ---------- ③ 금액 대조 ----------
    const expected = payment.gross_amount - payment.discount_amount;

    if (auth.amount !== expected) {
        console.error(
            `[payments/confirm] 금액 불일치 order=${auth.orderId} 결제창=${auth.amount} DB=${expected}`,
        );
        await netCancelQuietly(auth.orderId);
        await failPayment(admin, payment.id, "금액 불일치");
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: "AMOUNT_MISMATCH",
        });
    }

    // ---------- ④ 만료·재선택 재확인 ----------
    const expired =
        reservation.payment_deadline != null &&
        new Date(reservation.payment_deadline).getTime() <= Date.now();

    if (
        reservation.status !== "MATCHING" ||
        !reservation.confirmed_partner_id ||
        expired
    ) {
        console.warn(
            `[payments/confirm] 승인 직전 상태 변경 order=${auth.orderId} status=${reservation.status} expired=${expired}`,
        );
        await netCancelQuietly(auth.orderId);
        await failPayment(admin, payment.id, "결제 기한 만료 또는 선택 해제");
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: "PAYMENT_EXPIRED",
        });
    }

    // ---------- ⑤ PG 승인 — 여기서 돈이 빠진다 ----------
    let approved;
    try {
        approved = await gateway.approve({
            transactionId: auth.transactionId,
            amount: expected,
        });
    } catch (e) {
        const err = e instanceof PaymentGatewayError ? e : null;
        console.error(
            `[payments/confirm] 승인 실패 order=${auth.orderId} code=${err?.code} msg=${err?.message ?? String(e)}`,
        );

        // 응답을 못 받았다면 승인이 나갔을 수도 있다 → 재시도 대신 망취소로 정리한다.
        if (err?.indeterminate) await netCancelQuietly(auth.orderId);

        await failPayment(admin, payment.id, err?.message ?? "승인 실패");
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: err?.code ?? "APPROVE_FAILED",
        });
    }

    if (approved.status !== "PAID") {
        console.error(
            `[payments/confirm] 승인 응답이 PAID 가 아님 order=${auth.orderId} status=${approved.status}`,
        );
        await cancelApproved(
            auth.transactionId,
            auth.orderId,
            "승인 상태 이상",
        );
        await failPayment(admin, payment.id, `승인 상태 ${approved.status}`);
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: "APPROVE_NOT_PAID",
        });
    }

    // ---------- ⑥ 확정 — PAID 전이 + 예약 확정을 한 트랜잭션에 ----------
    const { error: finalizeError } = await admin.rpc("finalize_payment", {
        p_payment_id: payment.id,
        p_transaction_id: approved.transactionId,
        p_paid_at: approved.paidAt,
        p_receipt_url: approved.receiptUrl,
        p_raw: approved.raw,
    });

    if (finalizeError) {
        // ---------- ⑦ 돈은 받았는데 확정에 실패했다. 승인을 되돌린다 ----------
        console.error(
            `[payments/confirm] 확정 실패 → 승인 취소 order=${auth.orderId} err=${finalizeError.message}`,
        );
        await cancelApproved(
            approved.transactionId,
            auth.orderId,
            "예약 확정 실패로 자동 취소",
        );
        await failPayment(admin, payment.id, finalizeError.message);
        return redirectTo(request, "/reservation", {
            pay: "fail",
            code: "CONFIRM_FAILED",
        });
    }

    return redirectTo(request, "/mypage/reservations", {
        pay: "done",
        code: reservation.code,
    });
}

// =============================================================
// 보상 처리 — 전부 "실패해도 흐름을 막지 않는다".
// 여기서 예외를 던지면 이미 처리된 결제까지 되돌릴 수 없게 된다.
// =============================================================

type AdminClient = ReturnType<typeof createAdminClient>;

/** PENDING 결제를 접고 선점 포인트를 복원한다 */
async function cancelPending(
    admin: AdminClient,
    orderId: string,
    reason: string,
) {
    const { data } = await admin
        .from("payments")
        .select("id, status")
        .eq("order_id", orderId)
        .maybeSingle();

    if (!data || data.status !== "PENDING") return;
    await failPayment(admin, data.id, reason);
}

/** 결제를 FAILED 로 내리고 포인트를 되돌린다 */
async function failPayment(
    admin: AdminClient,
    paymentId: string,
    reason: string,
) {
    const { error } = await admin.rpc("release_points", {
        p_payment_id: paymentId,
        p_memo: reason.slice(0, 200),
    });
    if (error) {
        console.error(
            `[payments/confirm] 포인트 복원 실패 payment=${paymentId}`,
            error,
        );
    }

    await admin
        .from("payments")
        .update({ status: "FAILED" })
        .eq("id", paymentId);
}

/** 승인된 거래를 취소한다. 실패하면 로그만 남긴다 — 수동 정산 대상이다. */
async function cancelApproved(
    transactionId: string,
    orderId: string,
    reason: string,
) {
    try {
        await getPaymentGateway().cancel({ transactionId, orderId, reason });
    } catch (e) {
        console.error(
            `[payments/confirm] ⚠️ 승인 취소 실패 — 수동 확인 필요 order=${orderId} tid=${transactionId}`,
            e,
        );
    }
}

/** 승인 여부가 불확실할 때 쓰는 망취소. 유효기간 1시간. */
async function netCancelQuietly(orderId: string) {
    try {
        await getPaymentGateway().netCancel({ orderId });
    } catch {
        // 승인된 적이 없으면 "거래내역 없음"이 정상 응답이다. 조용히 넘긴다.
    }
}

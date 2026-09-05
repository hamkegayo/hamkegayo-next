import { NextResponse, type NextRequest } from "next/server";

import { getPaymentGateway, parseAuthResult } from "@/lib/payments/nicepay";
import { reportIncident } from "@/lib/payments/incident";
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
 *  결제창을 거치며 클라이언트 스토어가 날아갔으므로 `rid` 를 실어 보내
 *  예약 플로우가 DB 에서 상태를 복원하게 한다 (#54).
 *
 *  ⏱ **실행 시간 예산 — 9초.** 이 라우트만은 서버리스 함수 제한(레거시
 *     Hobby 10초) 안에서 ⑤~⑦ 이 전부 끝나야 한다. 중간에 잘리면 승인은
 *     났는데 ⑥ 이 안 돌아 "돈은 빠지고 예약은 미확정" 이 되고, ⑦ 의 되돌림도
 *     사고 기록도 남지 않는다.
 *       승인 5초(APPROVE_TIMEOUT_MS) + 복구 3초(RECOVERY_TIMEOUT_MS) + DB ≈ 1초
 *     `maxDuration` 은 일부러 지정하지 않는다 — 플랫폼 기본 상한을 그대로
 *     받고, 예산은 어댑터 타임아웃으로 강제한다. Fluid Compute(300초)로
 *     바뀌면 여유만 늘고 동작은 같다.
 */
export const dynamic = "force-dynamic";

/** 결과 화면으로 보낸다. 실패 사유는 코드로만 넘기고 상세는 서버 로그에 남긴다. */
function redirectTo(
    request: NextRequest,
    params: Record<string, string | undefined>,
) {
    const url = new URL("/reservation", request.nextUrl.origin);
    for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
    }
    // 303 — POST 를 GET 으로 바꿔 이동시킨다(새로고침 시 재전송 방지).
    return NextResponse.redirect(url, 303);
}

/**
 * 추가결제 결과 화면 (#75).
 *
 *  선결제와 달리 결제자가 **로그인 상태가 아닐 수 있다.** 예약 화면으로
 *  돌려보내면 로그인 벽에 막히므로 토큰 없이 볼 수 있는 결과 페이지로 보낸다.
 */
function extensionResult(
    request: NextRequest,
    params: Record<string, string | undefined>,
) {
    const url = new URL("/pay/result", request.nextUrl.origin);
    for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
    }
    return NextResponse.redirect(url, 303);
}

/** 결제 실패. rid 를 알면 함께 실어 결제 화면으로 되돌린다. */
function fail(request: NextRequest, code: string, rid?: string) {
    return redirectTo(request, { pay: "fail", code, rid });
}

export async function POST(request: NextRequest) {
    const form = await request.formData().catch(() => null);

    if (!form) return fail(request, "BAD_REQUEST");

    const auth = parseAuthResult(form);
    const admin = createAdminClient();

    // 결제창에서 사용자가 취소했거나 인증이 실패한 경우 — 돈은 나가지 않았다.
    if (!auth.ok || !auth.transactionId || !auth.orderId) {
        console.warn(
            `[payments/confirm] 인증 실패 code=${auth.code} msg=${auth.message} order=${auth.orderId ?? "-"}`,
        );
        const rid = auth.orderId
            ? await cancelPending(admin, auth.orderId, "결제창 인증 실패")
            : undefined;
        return fail(request, auth.code || "AUTH_FAILED", rid);
    }

    const gateway = getPaymentGateway();

    // ---------- ① signature 검증 ----------
    if (!gateway.verifyAuthResult(auth)) {
        console.error(
            `[payments/confirm] signature 불일치 order=${auth.orderId} tid=${auth.transactionId}`,
        );
        const rid = await cancelPending(
            admin,
            auth.orderId,
            "signature 검증 실패",
        );
        return fail(request, "INVALID_SIGNATURE", rid);
    }

    // ---------- ② 결제 행 조회 ----------
    const { data: payment } = await admin
        .from("payments")
        .select(
            "id, reservation_id, type, status, gross_amount, discount_amount, token_expires_at, reservations!inner(id, code, status, confirmed_partner_id, payment_deadline)",
        )
        .eq("order_id", auth.orderId)
        .maybeSingle();

    if (!payment) {
        // 우리가 만들지 않은 주문번호다. 승인하지 않고 즉시 망취소한다.
        // 반복되면 공격 신호이므로 기록한다.
        await netCancelQuietly(auth.orderId);
        await reportIncident({
            kind: "UNKNOWN_ORDER",
            orderId: auth.orderId,
            amount: auth.amount,
            detail: { transactionId: auth.transactionId },
        });
        return fail(request, "UNKNOWN_ORDER");
    }

    const rid = payment.reservation_id;
    const reservation = payment.reservations as unknown as {
        id: string;
        code: string;
        status: string;
        confirmed_partner_id: string | null;
        payment_deadline: string | null;
    };

    // 추가결제(#75)는 이미 확정된 예약에 붙는 청구다. 예약 상태 검증(④)과
    // 확정(⑥)이 적용되지 않으므로 여기서 갈라 둔다.
    const isExtension = payment.type === "EXTENSION";

    // 이미 승인이 끝난 결제 — 새로고침이나 중복 전송이다. 완료 화면으로 보낸다.
    if (payment.status === "PAID") {
        return isExtension
            ? extensionResult(request, {
                  status: "done",
                  code: reservation.code,
              })
            : redirectTo(request, { pay: "done", rid });
    }

    if (payment.status !== "PENDING") {
        await netCancelQuietly(auth.orderId);
        return fail(request, "PAYMENT_NOT_PENDING", rid);
    }

    // ---------- ③ 금액 대조 ----------
    const expected = payment.gross_amount - payment.discount_amount;

    if (auth.amount !== expected) {
        // 서명은 유효한데 금액이 다르다 → 위변조 시도일 수 있다.
        await netCancelQuietly(auth.orderId);
        await failPayment(admin, payment.id, "금액 불일치", auth.orderId);
        await reportIncident({
            kind: "AMOUNT_MISMATCH",
            orderId: auth.orderId,
            paymentId: payment.id,
            reservationCode: reservation.code,
            amount: expected,
            detail: { requested: auth.amount, expected },
        });
        return fail(request, "AMOUNT_MISMATCH", rid);
    }

    // ---------- ④ 만료·재선택 재확인 ----------
    //  추가결제는 링크 토큰의 유효기간으로 대신한다. 예약은 이미 확정됐고
    //  파트너 선택이 풀리는 일도 없다.
    const expired = isExtension
        ? payment.token_expires_at != null &&
          new Date(payment.token_expires_at).getTime() <= Date.now()
        : reservation.payment_deadline != null &&
          new Date(reservation.payment_deadline).getTime() <= Date.now();

    if (
        expired ||
        (!isExtension &&
            (reservation.status !== "MATCHING" ||
                !reservation.confirmed_partner_id))
    ) {
        // 정상 흐름이다(사용자가 늦었거나 선택이 풀렸다). 사고가 아니므로 로그만 남긴다.
        console.warn(
            `[payments/confirm] 승인 직전 상태 변경 order=${auth.orderId} status=${reservation.status} expired=${expired}`,
        );
        await netCancelQuietly(auth.orderId);
        await failPayment(
            admin,
            payment.id,
            "결제 기한 만료 또는 선택 해제",
            auth.orderId,
        );
        return isExtension
            ? extensionResult(request, { status: "expired" })
            : fail(request, "PAYMENT_EXPIRED", rid);
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

        // 응답을 못 받았다면 승인이 나갔을 수도 있다 → 재시도 대신 망취소로 정리한다.
        if (err?.indeterminate) {
            await netCancelQuietly(auth.orderId);
            // 망취소가 통했는지 알 수 없다. 사람이 PG 콘솔에서 확인해야 한다.
            await reportIncident({
                kind: "APPROVE_INDETERMINATE",
                orderId: auth.orderId,
                paymentId: payment.id,
                reservationCode: reservation.code,
                amount: expected,
                detail: {
                    transactionId: auth.transactionId,
                    pgCode: err.code,
                    pgMessage: err.message,
                },
            });
        } else {
            // PG 가 거절을 명시한 경우(한도 초과·카드 오류 등)는 사고가 아니다.
            console.warn(
                `[payments/confirm] 승인 거절 order=${auth.orderId} code=${err?.code} msg=${err?.message ?? String(e)}`,
            );
        }

        await failPayment(
            admin,
            payment.id,
            err?.message ?? "승인 실패",
            auth.orderId,
        );
        return fail(request, err?.code ?? "APPROVE_FAILED", rid);
    }

    if (approved.status !== "PAID") {
        await cancelApproved(
            auth.transactionId,
            auth.orderId,
            "승인 상태 이상",
            payment.id,
            expected,
        );
        await failPayment(
            admin,
            payment.id,
            `승인 상태 ${approved.status}`,
            auth.orderId,
        );
        return fail(request, "APPROVE_NOT_PAID", rid);
    }

    // ---------- ⑥ 확정 — PAID 전이 + 예약 확정을 한 트랜잭션에 ----------
    //  추가결제는 예약을 건드리지 않는다. 토큰을 소거해 1회용을 강제할 뿐이다.
    const { error: finalizeError } = isExtension
        ? await admin.rpc("finalize_extension_payment", {
              p_payment_id: payment.id,
              p_transaction_id: approved.transactionId,
              p_raw: approved.raw,
          })
        : await admin.rpc("finalize_payment", {
              p_payment_id: payment.id,
              p_transaction_id: approved.transactionId,
              p_paid_at: approved.paidAt,
              p_receipt_url: approved.receiptUrl,
              p_raw: approved.raw,
          });

    if (finalizeError) {
        // ---------- ⑦ 돈은 받았는데 확정에 실패했다. 승인을 되돌린다 ----------
        // 취소가 성공하면 고객 손해는 없다. 취소마저 실패하면 cancelApproved 가
        // CANCEL_FAILED 로 따로 알린다.
        await reportIncident({
            kind: "FINALIZE_FAILED",
            orderId: auth.orderId,
            paymentId: payment.id,
            reservationCode: reservation.code,
            amount: expected,
            detail: {
                transactionId: approved.transactionId,
                dbError: finalizeError.message,
            },
        });
        await cancelApproved(
            approved.transactionId,
            auth.orderId,
            "예약 확정 실패로 자동 취소",
            payment.id,
            expected,
        );
        await failPayment(
            admin,
            payment.id,
            finalizeError.message,
            auth.orderId,
        );
        return isExtension
            ? extensionResult(request, {
                  status: "fail",
                  code: reservation.code,
              })
            : fail(request, "CONFIRM_FAILED", rid);
    }

    if (isExtension) {
        // 추가결제는 파트너에게 알릴 것이 없다. 예약은 이미 확정돼 있었다.
        return extensionResult(request, {
            status: "done",
            code: reservation.code,
        });
    }

    // 확정됐으니 파트너에게 알린다 — 선택 시점이 아니라 결제 완료 시점이다(제9조 ④).
    await notifyPartner(admin, reservation.confirmed_partner_id);

    return redirectTo(request, { pay: "done", rid });
}

// =============================================================
// 보상 처리 — 전부 "실패해도 흐름을 막지 않는다".
// 여기서 예외를 던지면 이미 처리된 결제까지 되돌릴 수 없게 된다.
// =============================================================

type AdminClient = ReturnType<typeof createAdminClient>;

/** PENDING 결제를 접고 선점 포인트를 복원한다. 예약 id 를 돌려준다. */
async function cancelPending(
    admin: AdminClient,
    orderId: string,
    reason: string,
): Promise<string | undefined> {
    const { data } = await admin
        .from("payments")
        .select("id, status, reservation_id")
        .eq("order_id", orderId)
        .maybeSingle();

    if (!data) return undefined;
    if (data.status === "PENDING") {
        await failPayment(admin, data.id, reason, orderId);
    }
    return data.reservation_id;
}

/** 결제를 FAILED 로 내리고 포인트를 되돌린다 */
async function failPayment(
    admin: AdminClient,
    paymentId: string,
    reason: string,
    orderId?: string,
) {
    const { error } = await admin.rpc("release_points", {
        p_payment_id: paymentId,
        p_memo: reason.slice(0, 200),
    });
    if (error) {
        // 고객 포인트가 차감된 채로 남는다. 사람이 손으로 되돌려야 한다.
        await reportIncident({
            kind: "POINT_RESTORE_FAILED",
            orderId,
            paymentId,
            detail: { reason, dbError: error.message },
        });
    }

    await admin
        .from("payments")
        .update({ status: "FAILED" })
        .eq("id", paymentId);
}

/**
 * 승인된 거래를 취소한다.
 *
 *  ⚠️ 실패하면 **돈은 받았는데 예약이 없는 상태**가 된다.
 *     여기서 던지면 더 나빠지므로(이미 처리된 것까지 되돌릴 수 없다) 기록만 남기고
 *     담당자에게 즉시 알린다. 수동 취소 대상이다.
 */
async function cancelApproved(
    transactionId: string,
    orderId: string,
    reason: string,
    paymentId?: string,
    amount?: number,
) {
    try {
        await getPaymentGateway().cancel({ transactionId, orderId, reason });
    } catch (e) {
        const err = e instanceof PaymentGatewayError ? e : null;
        await reportIncident({
            kind: "CANCEL_FAILED",
            orderId,
            paymentId,
            amount,
            detail: {
                transactionId,
                reason,
                pgCode: err?.code ?? null,
                pgMessage: err?.message ?? String(e),
            },
        });
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

/** 확정 알림. 실패해도 결제는 이미 끝났으므로 흐름을 막지 않는다. */
async function notifyPartner(admin: AdminClient, partnerId: string | null) {
    if (!partnerId) return;
    try {
        const { error } = await admin.from("notifications").insert({
            recipient_id: partnerId,
            type: "RESERVATION_CONFIRMED",
            title: "예약이 확정되었어요",
            body: "고객이 결제를 완료해 예약이 확정되었습니다. 진행 관리에서 확인해 주세요.",
            link: "/partner/management",
        });
        if (error) {
            console.error("[payments/confirm] 파트너 알림 실패", error);
        }
    } catch (e) {
        console.error("[payments/confirm] 파트너 알림 예외", e);
    }
}

import { NextResponse, type NextRequest } from "next/server";

import { calcPaymentAmounts, generateOrderId } from "@/lib/payments/order";
import { PAYMENT_DEADLINE_MIN } from "@/lib/pricing";
import type { PlanCode } from "@/lib/reservation";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

/**
 * 선결제 준비 — 결제창을 열기 직전에 호출한다 (#53).
 *
 *  하는 일
 *    1. 세션에서 예약 소유자 확인
 *    2. 예약 행을 읽어 **서버가 금액을 재계산**한다 (클라이언트 값은 받지 않는다)
 *    3. 포인트를 선점한다 — 승인 후에 잔액 부족을 알면 이미 덜 받은 뒤다
 *    4. payments PENDING 행을 만든다 (order_id 가 멱등 키가 된다)
 *    5. 결제 기한을 +10분 연장한다 — 결제창을 띄우는 동안 만료되면 안 된다
 *
 *  응답의 금액은 결제창에 넘길 값이지만, 승인 시점에 서버가 DB 로 다시 대조한다.
 *  클라이언트가 이 값을 조작해도 승인 단계에서 걸린다.
 */
export const dynamic = "force-dynamic";

type Body = {
    reservationId?: unknown;
    pointsToUse?: unknown;
};

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json(
            { error: "로그인이 필요합니다." },
            { status: 401 },
        );
    }

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json(
            { error: "잘못된 요청입니다." },
            { status: 400 },
        );
    }

    const reservationId =
        typeof body.reservationId === "string" ? body.reservationId : null;
    const pointsToUse =
        typeof body.pointsToUse === "number" &&
        Number.isFinite(body.pointsToUse)
            ? Math.max(0, Math.floor(body.pointsToUse))
            : 0;

    if (!reservationId) {
        return NextResponse.json(
            { error: "예약 정보가 없습니다." },
            { status: 400 },
        );
    }

    const admin = createAdminClient();

    // ---------- 1. 예약 확인 ----------
    const { data: reservation, error: readError } = await admin
        .from("reservations")
        .select(
            "id, code, customer_id, status, plan, duration_minutes, surcharge_rate, fee_rate, prepaid_amount, confirmed_partner_id, payment_deadline",
        )
        .eq("id", reservationId)
        .maybeSingle();

    if (readError || !reservation) {
        return NextResponse.json(
            { error: "예약을 찾을 수 없습니다." },
            { status: 404 },
        );
    }

    if (reservation.customer_id !== user.id) {
        // 남의 예약이다. 존재 여부를 알려주지 않는다.
        return NextResponse.json(
            { error: "예약을 찾을 수 없습니다." },
            { status: 404 },
        );
    }

    if (reservation.status !== "MATCHING") {
        return NextResponse.json(
            { error: "결제할 수 있는 상태가 아닙니다.", code: "NOT_MATCHING" },
            { status: 409 },
        );
    }

    if (!reservation.confirmed_partner_id) {
        return NextResponse.json(
            {
                error: "파트너를 먼저 선택해 주세요.",
                code: "PARTNER_NOT_SELECTED",
            },
            { status: 409 },
        );
    }

    if (
        reservation.payment_deadline &&
        new Date(reservation.payment_deadline).getTime() <= Date.now()
    ) {
        return NextResponse.json(
            {
                error: "결제 시간이 지나 파트너 선택이 해제되었습니다.",
                code: "PAYMENT_EXPIRED",
            },
            { status: 409 },
        );
    }

    // ---------- 2. 금액 재계산 ----------
    const amounts = calcPaymentAmounts({
        plan: reservation.plan as PlanCode,
        durationMinutes: reservation.duration_minutes ?? 120,
        surchargeRate: Number(reservation.surcharge_rate ?? 0),
        feeRate: Number(reservation.fee_rate ?? 0.2),
        pointsToUse,
    });

    // 예약 시점에 저장한 선결제액과 어긋나면 멈춘다.
    // 요금표나 할증 판정이 바뀐 것이므로 조용히 넘기면 안 된다.
    if (
        reservation.prepaid_amount != null &&
        reservation.prepaid_amount !== amounts.gross
    ) {
        console.error(
            `[payments/prepare] 금액 불일치 reservation=${reservation.id} stored=${reservation.prepaid_amount} recalc=${amounts.gross}`,
        );
        return NextResponse.json(
            {
                error: "결제 금액을 확인할 수 없습니다. 고객센터로 문의해 주세요.",
                code: "AMOUNT_MISMATCH",
            },
            { status: 409 },
        );
    }

    if (amounts.charge <= 0) {
        return NextResponse.json(
            {
                error: "결제 금액이 0원입니다. 포인트 사용량을 줄여 주세요.",
                code: "ZERO_CHARGE",
            },
            { status: 400 },
        );
    }

    // ---------- 3. 이전 시도 정리 ----------
    // 같은 예약에 PENDING 이 남아 있으면(결제창을 닫았거나 실패) 선점 포인트를 되돌리고 버린다.
    const { data: stale } = await admin
        .from("payments")
        .select("id")
        .eq("reservation_id", reservation.id)
        .eq("type", "BASE")
        .eq("status", "PENDING");

    for (const row of stale ?? []) {
        await admin.rpc("release_points", {
            p_payment_id: row.id,
            p_memo: "결제 재시도로 선점 해제",
        });
        await admin
            .from("payments")
            .update({ status: "CANCELLED" })
            .eq("id", row.id);
    }

    // ---------- 4. PENDING 결제 생성 ----------
    const orderId = generateOrderId(reservation.code);

    const { data: payment, error: insertError } = await admin
        .from("payments")
        .insert({
            reservation_id: reservation.id,
            type: "BASE",
            status: "PENDING",
            order_id: orderId,
            gross_amount: amounts.gross,
            discount_amount: amounts.discount,
            commission_amount: amounts.commission,
            payout_amount: amounts.payout,
            commission_rate: amounts.commissionRate,
        })
        .select("id")
        .single();

    if (insertError || !payment) {
        console.error("[payments/prepare] 결제 생성 실패:", insertError);
        return NextResponse.json(
            { error: "결제를 시작할 수 없습니다." },
            { status: 500 },
        );
    }

    // ---------- 5. 포인트 선점 ----------
    if (amounts.discount > 0) {
        const { error: pointError } = await admin.rpc("spend_points", {
            p_payment_id: payment.id,
            p_amount: amounts.discount,
        });

        if (pointError) {
            await admin
                .from("payments")
                .update({ status: "FAILED" })
                .eq("id", payment.id);

            const insufficient = pointError.message.includes(
                "insufficient_points",
            );
            return NextResponse.json(
                {
                    error: insufficient
                        ? "포인트 잔액이 부족합니다."
                        : "포인트를 사용할 수 없습니다.",
                    code: insufficient ? "INSUFFICIENT_POINTS" : "POINT_ERROR",
                },
                { status: 409 },
            );
        }
    }

    // ---------- 6. 결제 기한 +10분 ----------
    // 결제창을 띄우는 동안 만료되면 승인 직전에 튕긴다. 화면 카운트다운도 이 값을 다시 읽는다.
    const extended = new Date(Date.now() + 10 * 60 * 1000);
    const current = reservation.payment_deadline
        ? new Date(reservation.payment_deadline)
        : null;

    if (!current || extended > current) {
        await admin
            .from("reservations")
            .update({ payment_deadline: extended.toISOString() })
            .eq("id", reservation.id);
    }

    return NextResponse.json({
        orderId,
        /** 결제창에 넘길 실제 승인 요청 금액 (총액 − 포인트) */
        amount: amounts.charge,
        grossAmount: amounts.gross,
        discountAmount: amounts.discount,
        goodsName: `병원동행 서비스 ${reservation.code}`,
        clientId: process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY ?? "",
        paymentDeadline: (current && current > extended
            ? current
            : extended
        ).toISOString(),
        deadlineMinutes: PAYMENT_DEADLINE_MIN,
    });
}

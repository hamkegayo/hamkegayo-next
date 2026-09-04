import { NextResponse, type NextRequest } from "next/server";

import { getPaymentGateway } from "@/lib/payments/nicepay";
import { reportIncident } from "@/lib/payments/incident";
import { PaymentGatewayError } from "@/lib/payments/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

/**
 * 결제 상태 조회 (#53).
 *
 *  용도는 하나다 — **승인 응답을 못 받았을 때 실제로 결제가 됐는지 확인**하는 것.
 *  나이스페이 문서가 "승인 API 에서 read-timeout 이 나면 재시도하지 말고
 *  조회하라" 고 규정한다. 승인을 두 번 부르면 이중 청구가 날 수 있다.
 *
 *  DB 가 PAID 면 PG 를 부르지 않는다. 불일치할 때만 PG 를 확인해서
 *  "DB 는 PENDING 인데 PG 는 paid" 같은 어긋남을 드러낸다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

    const orderId = request.nextUrl.searchParams.get("orderId");
    if (!orderId) {
        return NextResponse.json(
            { error: "orderId 가 필요합니다." },
            { status: 400 },
        );
    }

    const admin = createAdminClient();

    const { data: payment } = await admin
        .from("payments")
        .select(
            "id, status, gross_amount, discount_amount, paid_at, transaction_id, reservations!inner(customer_id, code, status)",
        )
        .eq("order_id", orderId)
        .maybeSingle();

    if (!payment) {
        return NextResponse.json(
            { error: "결제를 찾을 수 없습니다." },
            { status: 404 },
        );
    }

    const reservation = payment.reservations as unknown as {
        customer_id: string;
        code: string;
        status: string;
    };

    // 본인 결제만 조회할 수 있다.
    if (reservation.customer_id !== user.id) {
        return NextResponse.json(
            { error: "결제를 찾을 수 없습니다." },
            { status: 404 },
        );
    }

    const base = {
        orderId,
        status: payment.status,
        amount: payment.gross_amount - payment.discount_amount,
        paidAt: payment.paid_at,
        reservationCode: reservation.code,
        reservationStatus: reservation.status,
    };

    // 이미 확정된 결제는 PG 를 부를 이유가 없다.
    if (payment.status === "PAID") {
        return NextResponse.json({ ...base, gatewayStatus: "PAID" });
    }

    // PENDING 인데 실제로는 승인됐을 수 있다 → PG 에 물어본다.
    try {
        const remote = await getPaymentGateway().find({ orderId });

        /**
         * true 면 "PG 는 결제됐는데 우리 DB 는 아니다" 는 뜻이다.
         * 화면은 사용자에게 재시도를 권하지 말고 고객센터로 안내해야 한다.
         */
        const mismatch = remote.status === "PAID" && payment.status !== "PAID";

        if (mismatch) {
            // 고객이 돈을 냈는데 예약이 없는 상태다. 사람이 정리해야 한다.
            await reportIncident({
                kind: "STATE_MISMATCH",
                orderId,
                paymentId: payment.id,
                reservationCode: reservation.code,
                amount: base.amount,
                detail: {
                    dbStatus: payment.status,
                    gatewayStatus: remote.status,
                    transactionId: remote.transactionId,
                },
            });
        }

        return NextResponse.json({
            ...base,
            gatewayStatus: remote.status,
            mismatch,
        });
    } catch (e) {
        const err = e instanceof PaymentGatewayError ? e : null;

        // 거래내역 없음(U107)은 정상이다 — 인증 단계에서 이탈한 경우다.
        return NextResponse.json({
            ...base,
            gatewayStatus: "NOT_FOUND",
            mismatch: false,
            gatewayCode: err?.code ?? null,
        });
    }
}

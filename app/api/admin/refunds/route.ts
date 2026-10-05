import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPaymentGateway } from "@/lib/payments/nicepay";
import {
    matchesRefundPayment,
    verifyApprovedRefund,
} from "@/lib/payments/approved-refund";
import { reportIncident } from "@/lib/payments/incident";

export async function POST(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin)
        return NextResponse.json(
            { message: "잘못된 요청입니다." },
            { status: 403 },
        );
    const body = await request.json().catch(() => null);
    if (
        !/^[0-9a-f-]{36}$/i.test(body?.id ?? "") ||
        typeof body?.reason !== "string" ||
        body.reason.trim().length < 5 ||
        body.reason.length > 500 ||
        !["approve", "inspect"].includes(body.action) ||
        (body.action === "approve" && body.confirm !== true)
    )
        return NextResponse.json(
            { message: "사유와 환불 확인이 필요합니다." },
            { status: 400 },
        );
    const client = await createClient();
    const { data: d, error } = await client.rpc("admin_prepare_refund", {
        p_id: body.id,
        p_reason: body.reason.trim(),
    });
    if (error || !d)
        return NextResponse.json(
            { message: "권한·MFA·예약 및 환불 상태를 확인해 주세요." },
            { status: 409 },
        );
    const expected = {
        orderId: d.orderId,
        transactionId: d.transactionId,
        cash: d.cash,
        amount: d.amount,
        balanceBefore: d.balanceBefore ?? d.cash,
    };
    let gateway;
    try {
        gateway = getPaymentGateway();
    } catch {
        return NextResponse.json(
            { message: "결제 설정을 확인해 주세요." },
            { status: 503 },
        );
    }
    if (body.action === "approve") {
        if (d.claimed || d.status !== "PENDING")
            return NextResponse.json(
                {
                    message:
                        "이미 승인·요청된 건입니다. 재취소 없이 결과를 조회해 주세요.",
                },
                { status: 409 },
            );
        let payment;
        try {
            payment = await gateway.find({ orderId: d.orderId });
        } catch {
            return NextResponse.json(
                {
                    message:
                        "원거래를 조회하지 못했습니다. 취소는 실행하지 않았습니다.",
                },
                { status: 502 },
            );
        }
        if (
            !matchesRefundPayment(payment, expected) ||
            payment.status !== "PAID" ||
            payment.balanceAmount !== d.cash
        )
            return NextResponse.json(
                {
                    message:
                        "PG 원거래 잔액이 일치하지 않습니다. 관리자 콘솔에서 대조해 주세요.",
                },
                { status: 409 },
            );
        const claimed = await client.rpc("admin_claim_refund", {
            p_id: body.id,
            p_reason: body.reason.trim(),
            p_balance: payment.balanceAmount,
            p_tid: payment.transactionId,
        });
        if (claimed.error)
            return NextResponse.json(
                {
                    message:
                        "환불 선점에 실패했습니다. 새로고침 후 상태를 확인해 주세요.",
                },
                { status: 409 },
            );
    } else if (!d.claimed)
        return NextResponse.json(
            {
                message:
                    "앱 집행 기록이 없는 기존 승인건은 PG 콘솔에서 확인해야 합니다.",
            },
            { status: 409 },
        );
    const verified = await verifyApprovedRefund(
        gateway,
        expected,
        body.action === "approve",
    );
    const admin = createAdminClient();
    const recorded = verified
        ? await admin.rpc("record_verified_refund", {
              p_id: body.id,
              p_balance: verified.balanceAmount,
              p_tid: verified.transactionId,
              p_raw: verified.raw as never,
          })
        : null;
    if (!verified || !recorded || recorded.error) {
        await reportIncident({
            kind: verified ? "REFUND_RECORD_FAILED" : "REFUND_FAILED",
            paymentId: d.paymentId,
            orderId: d.orderId,
            amount: d.amount,
            detail: { stage: "ADMIN_SETTLEMENT_REFUND", indeterminate: true },
        });
        return NextResponse.json(
            {
                message:
                    "결과 확인이 필요합니다. 취소를 재시도하지 말고 결과 조회 또는 PG 콘솔로 대조해 주세요.",
            },
            { status: 409 },
        );
    }
    return NextResponse.json({
        ok: true,
        message: "원거래 환불 결과와 DB 기록을 확인했습니다.",
    });
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPaymentGateway } from "@/lib/payments/nicepay";
import { reportIncident } from "@/lib/payments/incident";
import { cancelIncidentTransaction } from "@/lib/payments/incident-cancel";

export async function POST(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin)
        return NextResponse.json(
            { message: "잘못된 요청입니다." },
            { status: 403 },
        );
    const body = await request.json().catch(() => null);
    if (
        typeof body?.incidentId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.incidentId) ||
        typeof body?.reason !== "string" ||
        body.reason.trim().length < 5 ||
        body.reason.length > 500 ||
        (body.confirm !== true && body.inspect !== true)
    )
        return NextResponse.json(
            { message: "사고·취소 사유·전액 취소 확인이 필요합니다." },
            { status: 400 },
        );
    const client = await createClient();
    const { data, error } =
        body.inspect === true
            ? await client.rpc("admin_inspect_incident_cancel", {
                  p_incident: body.incidentId,
              })
            : await client.rpc("admin_claim_incident_cancel", {
                  p_incident: body.incidentId,
                  p_reason: body.reason.trim(),
              });
    if (error || !data)
        return NextResponse.json(
            {
                message:
                    "권한·MFA·결제 상태를 확인해 주세요. 이미 요청된 건은 PG에서 확인해야 합니다. 정상 결제는 기존 환불 경로를 이용해 주세요.",
            },
            { status: 409 },
        );
    const admin = createAdminClient();
    let result = { completed: false, transactionId: null as string | null };
    try {
        result = await cancelIncidentTransaction(getPaymentGateway(), {
            orderId: data.orderId,
            amount: data.amount,
            reason: body.reason.trim(),
            inspect: body.inspect === true,
        });
    } catch {
        // 키 설정/어댑터 초기화 실패도 claim을 UNKNOWN으로 기록한다.
    }
    const { completed, transactionId: tid } = result;
    const recorded = await admin.rpc("record_incident_cancel", {
        p_payment: data.paymentId,
        p_completed: completed,
        p_tid: tid,
    });
    if (!completed || recorded.error) {
        await reportIncident({
            kind: completed ? "REFUND_RECORD_FAILED" : "CANCEL_FAILED",
            paymentId: data.paymentId,
            orderId: data.orderId,
            amount: data.amount,
            detail: { adminIncidentCancel: true, indeterminate: true },
        });
        return NextResponse.json(
            {
                message:
                    "처리 결과 확인이 필요합니다. 재취소하지 말고 NICEPAY 관리자에서 원거래와 DB 기록을 확인해 주세요.",
            },
            { status: 409 },
        );
    }
    return NextResponse.json({
        ok: true,
        message:
            "원거래 전액 취소를 확인했습니다. 고객 안내 후 사고 해결 상태를 별도로 기록해 주세요.",
    });
}

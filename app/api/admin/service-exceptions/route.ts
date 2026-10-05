import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPaymentGateway } from "@/lib/payments/nicepay";
import { verifyExceptionTransactions } from "@/lib/payments/exception-verification";

export async function POST(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin)
        return NextResponse.json(
            { message: "잘못된 요청입니다." },
            { status: 403 },
        );
    const body = await request.json().catch(() => null);
    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            body?.serviceId ?? "",
        ) ||
        typeof body?.reason !== "string" ||
        body.reason.trim().length < 5 ||
        body.reason.length > 500 ||
        body.confirm !== true
    )
        return NextResponse.json(
            { message: "대상·확인 사유·완료 확인이 필요합니다." },
            { status: 400 },
        );
    const client = await createClient();
    const { data, error } = await client.rpc("admin_get_service_exception", {
        p_service: body.serviceId,
        p_reason: body.reason.trim(),
    });
    if (error || !data?.decision)
        return NextResponse.json(
            { message: "권한·MFA 및 운영 판정을 확인해 주세요." },
            { status: 403 },
        );
    if (data.decision.resolved_at)
        return NextResponse.json({
            ok: true,
            message: "이미 처리 완료되었습니다.",
        });
    let verified = null;
    try {
        verified = await verifyExceptionTransactions(
            getPaymentGateway(),
            data.transactions,
        );
    } catch {
        // 키 설정 실패도 보류 유지. 어떠한 PG 취소도 실행하지 않는다.
    }
    if (!verified)
        return NextResponse.json(
            {
                message:
                    "PG 잔액 또는 추가결제를 확인하지 못했습니다. 보류를 유지합니다. PG 관리자에서 원거래를 확인해 주세요.",
            },
            { status: 409 },
        );
    const recorded = await createAdminClient().rpc(
        "record_service_exception_resolution",
        {
            p_service: body.serviceId,
            p_actor: data.actorId,
            p_verified: verified,
        },
    );
    if (recorded.error)
        return NextResponse.json(
            {
                message:
                    "PG 조회 후 원장 기록에 실패했습니다. 다시 환불하지 말고 결과 조회를 다시 진행해 주세요.",
            },
            { status: 409 },
        );
    return NextResponse.json({
        ok: true,
        message:
            "PG 잔액·원장·최종 정산을 확인하고 보류를 해제했습니다. 정산 지급은 기존 별도 승인 절차를 따릅니다.",
    });
}

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";

type TransferRow = {
    batch_code: string;
    item_id: string;
    bank_code: string;
    bank_name: string;
    account_number: string;
    holder_name: string;
    amount: number;
    memo: string;
};

function csvCell(value: string | number) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function POST(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json(
            { message: "잘못된 요청입니다." },
            { status: 403 },
        );
    }
    const body = (await request.json().catch(() => null)) as {
        batchId?: unknown;
        reason?: unknown;
    } | null;
    const batchId = typeof body?.batchId === "string" ? body.batchId : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (
        !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(batchId) ||
        reason.length < 5 ||
        reason.length > 500
    ) {
        return NextResponse.json(
            { message: "배치와 발급 사유를 확인해 주세요." },
            { status: 400 },
        );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_issue_transfer_file", {
        p_batch_id: batchId,
        p_reason: reason,
    });
    if (error) {
        const secondAdmin =
            error.message.includes("second_admin_required") ||
            error.message.includes("issuer_mismatch");
        return NextResponse.json(
            {
                message: secondAdmin
                    ? "배치 생성자와 다른 정산 담당자가 발급해야 합니다. 재다운로드는 최초 발급자만 가능합니다."
                    : "이체 파일을 발급하지 못했습니다.",
            },
            { status: secondAdmin ? 403 : 409 },
        );
    }

    const rows = (data ?? []) as TransferRow[];
    if (rows.length === 0) {
        return NextResponse.json(
            { message: "이체할 항목이 없습니다." },
            { status: 409 },
        );
    }
    const header = [
        "item_id",
        "bank_code",
        "bank_name",
        "account_number",
        "holder_name",
        "amount",
        "memo",
    ];
    const csv = [
        header.join(","),
        ...rows.map((row) =>
            [
                row.item_id,
                row.bank_code,
                row.bank_name,
                row.account_number,
                row.holder_name,
                row.amount,
                row.memo,
            ]
                .map(csvCell)
                .join(","),
        ),
    ].join("\r\n");
    const filename = `${rows[0].batch_code.replaceAll(/[^A-Z0-9-]/gi, "_")}.csv`;
    return new NextResponse(`\uFEFF${csv}`, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

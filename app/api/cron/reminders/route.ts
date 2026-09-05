import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";
import { sendExtensionReminder } from "@/lib/payments/extension";

/**
 * 추가결제 독촉 (#75) — 약관 제22조 ①.
 *
 *  하루 1회 돈다. DB 에서 메일을 보낼 수 없어 pg_cron 배치(5분)가 아니라
 *  Vercel Cron 을 쓴다 — Hobby 는 하루 1회·최대 2개가 한계이고 keepalive
 *  와 합쳐 딱 두 개다.
 *
 *  대상 선정과 reminded_at 갱신을 RPC 가 한 문장으로 처리한다. 나눠 놓으면
 *  발송 후 갱신에 실패했을 때 같은 사람에게 매일 두 번 나간다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;

    if (!secret) {
        return NextResponse.json(
            { ok: false, error: "CRON_SECRET is not configured" },
            { status: 500 },
        );
    }
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_extension_reminders", {
        p_limit: 100,
    });

    if (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 },
        );
    }

    const targets = (data ?? []) as {
        payment_id: string;
        customer_id: string;
        amount: number;
        code: string;
        use_date: string;
        pay_token: string | null;
        overdue: boolean;
    }[];

    let sent = 0;
    for (const t of targets) {
        // 한 건이 실패해도 나머지는 보낸다.
        if (await sendExtensionReminder(t)) sent += 1;
    }

    return NextResponse.json({
        ok: true,
        claimed: targets.length,
        sent,
        at: new Date().toISOString(),
    });
}

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";
import {
    notifyCollectionHandover,
    sendExtensionReminder,
} from "@/lib/payments/extension";

/**
 * 추가결제 독촉 (#75) — 약관 제22조 ①.
 *
 *  하루 1회 돈다. DB 에서 메일을 보낼 수 없어 pg_cron 배치(5분)가 아니라
 *  Vercel Cron 을 쓴다 — Hobby 는 하루 1회·최대 2개가 한계이고 keepalive
 *  와 합쳐 딱 두 개다.
 *
 *  대상 선정과 reminded_at 갱신을 RPC 가 한 문장으로 처리한다. 나눠 놓으면
 *  발송 후 갱신에 실패했을 때 같은 사람에게 매일 두 번 나간다.
 *
 *  발송 상한(7회)도 RPC 안에 있다. 상한에 닿은 건은 `handed_over` 로 표시돼
 *  마지막 안내가 나가고 다음 배치부터는 대상에서 빠진다 — 끝없이 나가는
 *  메일은 스팸 신고를 부르고, 그 신고가 쌓이면 인증 메일까지 스팸함으로
 *  간다(2026-09-05 리뷰).
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
        handed_over: boolean;
    }[];

    let sent = 0;
    for (const t of targets) {
        // 한 건이 실패해도 나머지는 보낸다.
        if (await sendExtensionReminder(t)) sent += 1;
    }

    // 자동 회수가 끝난 건은 사람에게 넘긴다. 알리지 않으면 조용히 묻힌다.
    const handed = targets.filter((t) => t.handed_over);
    await notifyCollectionHandover(
        handed.map((t) => ({ code: t.code, amount: t.amount })),
    );

    return NextResponse.json({
        ok: true,
        claimed: targets.length,
        sent,
        handedOver: handed.length,
        at: new Date().toISOString(),
    });
}

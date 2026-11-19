import { NextResponse, type NextRequest } from "next/server";

import { dispatchIntakeNotifications } from "@/lib/intake-notification.server";

/**
 * 운영자 신규 접수 알림 재시도 (#300).
 *
 *  결제 승인 직후 즉시 발송을 시도하지만(app/api/payments/confirm), 메일 장애·키 누락으로 못 나간 건은
 *  접수 행에 PENDING/FAILED 로 남는다. 이 엔드포인트가 남은 건을 다시 보낸다.
 *
 *  호출 주체 — Vercel Hobby 크론은 하루 1회·2개가 한계이고 이미 keepalive·reminders 가 쓰고 있어
 *  vercel.json 에는 넣지 않았다. 외부 스케줄러(또는 Pro 플랜 크론)가 5-10분 간격으로
 *  `Authorization: Bearer <CRON_SECRET>` 와 함께 GET 하면 된다. 관리자 목록 화면도 같은 함수를 부를 수 있다.
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

    const result = await dispatchIntakeNotifications(25);
    return NextResponse.json({ ok: true, ...result });
}

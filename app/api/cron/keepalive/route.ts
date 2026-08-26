import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";

// 응답이 캐시되면 Supabase 까지 요청이 닿지 않아 keepalive 가 무효가 된다.
export const dynamic = "force-dynamic";

/**
 * Supabase 무료 플랜의 "7일 미사용 시 자동 일시정지" 를 막는 keepalive.
 *  - Vercel Cron 이 하루 1회 호출한다(vercel.json).
 *  - 단순 조회 대신 expire_past_matchings RPC 로 실제 쓰기를 발생시킨다.
 *    (일시정지 판정 기준이 "user database activity" 이므로 쓰기가 더 확실하고,
 *     겸사겸사 방치된 미확정 예약도 정리된다)
 *  - 조회 시점의 lazy 만료(lib/expire-matchings.ts)는 그대로 유지되므로
 *    이 cron 이 실패해도 만료 처리가 지연되지는 않는다.
 */
export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;

    // 미설정 시 `Bearer undefined` 로 인증이 통과되지 않도록 먼저 차단한다.
    if (!secret) {
        return NextResponse.json(
            { ok: false, error: "CRON_SECRET is not configured" },
            { status: 500 },
        );
    }

    // Vercel Cron 은 CRON_SECRET 이 등록돼 있으면 이 헤더를 자동으로 붙여 보낸다.
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { data, error } = await createAdminClient().rpc(
        "expire_past_matchings",
    );

    // best-effort 인 lazy 호출과 달리 여기서는 실패를 그대로 드러낸다.
    // 200 으로 삼키면 cron 이 죽어도 알아챌 방법이 없다.
    if (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 },
        );
    }

    return NextResponse.json({
        ok: true,
        expired: data ?? 0,
        at: new Date().toISOString(),
    });
}

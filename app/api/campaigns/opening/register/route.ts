import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { ensureOpeningEventEmail } from "@/lib/opening-event-email.server";

export const dynamic = "force-dynamic";

/**
 * 인증 이메일 HMAC 등록 (#283 리뷰). 상태를 바꾸므로 조회(GET)와 분리한다.
 * 정원은 확보하지 않는다. 확보는 결제 준비(/api/payments/prepare)에서만 한다.
 */
export async function POST() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ registered: false }, { status: 401 });
    // 행사 종료 후에는 식별값을 수집하지 않는다 (#297). 결제 화면·쿠폰함이 열릴 때마다
    // 등록 RPC 가 거부되지 않도록 종료 여부(DB 의 ends_at·closed_at)를 먼저 읽고 돌아간다.
    // 조회가 실패하면 등록 RPC 가 종료를 다시 검사한다.
    const { data: status } = await supabase.rpc("opening_event_status");
    if ((status as { ended?: boolean }[] | null)?.[0]?.ended === true)
        return NextResponse.json(
            { registered: false },
            { headers: { "Cache-Control": "no-store" } },
        );
    const registered = await ensureOpeningEventEmail(user);
    return NextResponse.json(
        { registered },
        { headers: { "Cache-Control": "no-store" } },
    );
}

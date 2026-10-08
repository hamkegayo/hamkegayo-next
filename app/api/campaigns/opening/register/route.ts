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
    const registered = await ensureOpeningEventEmail(user);
    return NextResponse.json(
        { registered },
        { headers: { "Cache-Control": "no-store" } },
    );
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { openingEventEmailStatus } from "@/lib/opening-event-email.server";
import type { OpeningCoupon } from "@/lib/opening-coupon";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const HIDDEN: OpeningCoupon = { state: "HIDDEN", discount: 0, ended: false };

/**
 * 예약 ID 없이 오픈 이벤트 쿠폰 상태를 조회한다 (#282).
 * 읽기만 한다: 식별값을 등록(ensureOpeningEventEmail)하거나 정원을 확보하지 않는다.
 * 쿠폰함 페이지와 같은 규칙으로, 미등록 회원에게는 AVAILABLE/HELD 를 PAUSED 로 낮춘다.
 */
export async function GET() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json(HIDDEN, { status: 401, headers: NO_STORE });
    const registered = (await openingEventEmailStatus(user)) === "registered";
    const { data, error } = await supabase.rpc("opening_event_coupon");
    if (error || !data)
        return NextResponse.json(HIDDEN, { status: 500, headers: NO_STORE });
    const raw = data as OpeningCoupon;
    const coupon: OpeningCoupon =
        !registered && ["AVAILABLE", "HELD"].includes(raw.state)
            ? { ...raw, state: "PAUSED" }
            : raw;
    return NextResponse.json(
        { ...coupon, ended: coupon.ended ?? coupon.state === "CLOSED" },
        { headers: NO_STORE },
    );
}

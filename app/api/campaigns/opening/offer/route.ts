import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { openingEventEmailStatus } from "@/lib/opening-event-email.server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ eligible: false }, { status: 401 });
    const id = request.nextUrl.searchParams.get("rid");
    if (!id || !/^[a-f\d-]{36}$/i.test(id))
        return NextResponse.json({ eligible: false }, { status: 400 });
    // 조회는 읽기만 한다. 등록은 POST /api/campaigns/opening/register 가 맡는다 (#283 리뷰).
    // 소진/일시 중지 후에도 기존 쿠폰 상태를 보여 준다. 미등록을 사용 가능으로 처리하지 않는다.
    const registered = (await openingEventEmailStatus(user)) === "registered";
    const { data, error } = await supabase.rpc("opening_event_offer", {
        p_reservation_id: id,
    });
    // 미등록이어도 소진/중지 상태는 표시하되 AVAILABLE로 결제 가능하다고 안내하지 않는다.
    const offer = error
        ? { eligible: false, state: "HIDDEN", discount: 0 }
        : registered
          ? data
          : {
                ...data,
                eligible: false,
                state: ["AVAILABLE", "HELD"].includes(data?.state)
                    ? "PAUSED"
                    : data?.state,
            };
    return NextResponse.json(offer, {
        headers: { "Cache-Control": "no-store" },
    });
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { ensureOpeningEventEmail } from "@/lib/opening-event-email.server";

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
    const { data: status } = await supabase.rpc("opening_event_status");
    if (!status?.[0]?.enabled)
        return NextResponse.json(
            { eligible: false },
            { headers: { "Cache-Control": "no-store" } },
        );
    if (!(await ensureOpeningEventEmail(user)))
        return NextResponse.json(
            { eligible: false },
            { headers: { "Cache-Control": "no-store" } },
        );
    const { data, error } = await supabase.rpc("opening_event_offer", {
        p_reservation_id: id,
    });
    return NextResponse.json(error ? { eligible: false } : data, {
        headers: { "Cache-Control": "no-store" },
    });
}

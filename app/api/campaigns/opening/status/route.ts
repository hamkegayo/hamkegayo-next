import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export async function GET() {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("opening_event_status");
    const row = (
        data as unknown as { enabled: boolean; remaining: number }[] | null
    )?.[0];
    return NextResponse.json(
        error || !row ? { enabled: false, remaining: 0 } : row,
        { headers: { "Cache-Control": "no-store" } },
    );
}

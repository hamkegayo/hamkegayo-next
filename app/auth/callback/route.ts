import { NextResponse, type NextRequest } from "next/server";

import { safeInternalPath } from "@/lib/auth/social";
import { createClient } from "@/utils/supabase/server";

function loginError(request: NextRequest, code: string) {
    const url = new URL("/login", request.url);
    url.searchParams.set("oauth_error", code);
    return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get("code");
    const next = safeInternalPath(request.nextUrl.searchParams.get("next"));

    if (!code) return loginError(request, "missing_code");

    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) return loginError(request, "exchange_failed");

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", data.user.id)
        .maybeSingle();

    if (profileError) {
        await supabase.auth.signOut();
        return loginError(request, "profile_check_failed");
    }

    if (!profile) {
        const url = new URL("/signup/social", request.url);
        url.searchParams.set("next", next);
        return NextResponse.redirect(url);
    }

    if (profile.role !== "USER" || profile.status !== "ACTIVE") {
        await supabase.auth.signOut();
        return loginError(request, "account_unavailable");
    }

    return NextResponse.redirect(new URL(next, request.url));
}

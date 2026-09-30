import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/auth/social";
import { createClient } from "@/utils/supabase/server";

import { SocialSignupForm } from "./_components/social-signup-form";

export const metadata: Metadata = {
    title: "소셜 회원가입",
    robots: { index: false, follow: false },
};

export default async function SocialSignupPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .maybeSingle();
    const next = safeInternalPath((await searchParams).next);
    if (profile?.role === "USER" && profile.status === "ACTIVE") redirect(next);
    if (profile) redirect("/login?oauth_error=account_unavailable");
    if (!user.email) redirect("/login?oauth_error=email_required");

    const initialName =
        typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name
              : typeof user.user_metadata?.nickname === "string"
                ? user.user_metadata.nickname
                : "";

    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
            <SocialSignupForm
                email={user.email}
                initialName={initialName}
                next={next}
            />
        </div>
    );
}

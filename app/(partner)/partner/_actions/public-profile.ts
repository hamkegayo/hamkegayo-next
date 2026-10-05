"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { PartnerPublicProfile, WorkHistory } from "@/lib/partner-details";

export async function getPartnerPublicProfile(): Promise<PartnerPublicProfile | null> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const [consent, histories, release] = await Promise.all([
        supabase
            .from("partner_public_profiles")
            .select("consented_at")
            .eq("partner_id", user.id)
            .maybeSingle(),
        supabase
            .from("partner_work_histories")
            .select("id, hospital, period, department, duties, status, kind")
            .eq("partner_id", user.id)
            .order("created_at", { ascending: false }),
        supabase.rpc("partner_public_details_enabled"),
    ]);
    if (consent.error || histories.error) return null;
    return {
        consent: Boolean(consent.data?.consented_at),
        publicEnabled: !release.error && release.data === true,
        histories: histories.data ?? [],
    };
}

async function updateProfile(rpc: string, args: Record<string, unknown>) {
    try {
        const supabase = await createClient();
        const { error } = await supabase.rpc(rpc, args);
        if (error)
            return {
                ok: false as const,
                message:
                    "저장하지 못했습니다. 입력 내용과 로그인 상태를 확인해 주세요.",
            };
        revalidatePath("/partner/profile");
        revalidatePath("/admin/qualifications");
        return { ok: true as const };
    } catch {
        return {
            ok: false as const,
            message: "저장 요청에 실패했습니다. 다시 시도해 주세요.",
        };
    }
}

export async function setPartnerPublicConsent(consent: boolean) {
    if (typeof consent !== "boolean")
        return {
            ok: false as const,
            message: "공개 동의 여부를 확인해 주세요.",
        };
    return updateProfile("set_partner_public_consent", { p_consent: consent });
}

export async function submitPartnerWorkHistory(input: Omit<WorkHistory, "id">) {
    const limits = { hospital: 100, period: 100, department: 100, duties: 300 };
    if (
        !input ||
        Object.entries(limits).some(([key, max]) => {
            const value = input[key as keyof typeof limits];
            return (
                typeof value !== "string" || !value.trim() || value.length > max
            );
        })
    )
        return {
            ok: false as const,
            message:
                "병원·기간·부서(각 100자), 담당 업무(300자)를 입력해 주세요.",
        };
    return updateProfile("submit_partner_work_history", {
        p_hospital: input.hospital,
        p_period: input.period,
        p_department: input.department,
        p_duties: input.duties,
    });
}

export async function deletePartnerWorkHistory(id: string) {
    return updateProfile("delete_partner_work_history", { p_id: id });
}

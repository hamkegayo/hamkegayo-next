"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type EvidenceRetentionStatus = {
    notifiedAt: string | null;
    expiresAt: string | null;
    appealOpen: boolean;
    unavailable: boolean | null;
};

export async function getEvidenceRetention(
    id: string,
    kind: "QUALIFICATION" | "HISTORY",
) {
    const client = await createClient();
    const { data, error } = await client.rpc(
        "partner_evidence_retention_status",
        { p_id: id, p_kind: kind },
    );
    return error ? null : (data as EvidenceRetentionStatus);
}

export async function manageEvidenceRetention(
    id: string,
    kind: "QUALIFICATION" | "HISTORY",
    action: "appeal" | "hold" | "resolve" | "notify",
    reason: string,
) {
    const client = await createClient();
    const { error } = await client.rpc("manage_partner_evidence_retention", {
        p_id: id,
        p_kind: kind,
        p_action: action,
        p_reason: reason,
    });
    if (error)
        return {
            ok: false,
            message:
                "권한·MFA·사유(5~500자)와 현재 이의신청/보유기간을 확인해 주세요.",
        };
    revalidatePath("/partner/profile");
    revalidatePath("/admin/qualifications");
    return { ok: true };
}

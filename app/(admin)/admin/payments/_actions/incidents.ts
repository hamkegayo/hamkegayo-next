"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

export type IncidentActionResult =
    { ok: true } | { ok: false; message: string };

const CONTACT_METHODS = ["PHONE", "EMAIL", "KAKAO", "OTHER"] as const;

export async function updatePaymentIncidentStatus(input: {
    incidentId: string;
    status: "ACKNOWLEDGED" | "RESOLVED";
    memo: string;
}): Promise<IncidentActionResult> {
    const memo = input.memo.trim();
    if (memo.length < 2 || memo.length > 1000) {
        return { ok: false, message: "처리 메모를 2자 이상 입력해 주세요." };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_update_payment_incident", {
        p_id: input.incidentId,
        p_status: input.status,
        p_memo: memo,
    });
    if (error) {
        return {
            ok: false,
            message:
                error.code === "P0001"
                    ? "현재 상태에서는 해당 처리로 변경할 수 없습니다."
                    : "결제 사고 상태 변경에 실패했습니다.",
        };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/payments");
    return { ok: true };
}

export async function recordPaymentIncidentContact(input: {
    incidentId: string;
    method: (typeof CONTACT_METHODS)[number];
    note: string;
}): Promise<IncidentActionResult> {
    const note = input.note.trim();
    if (!CONTACT_METHODS.includes(input.method)) {
        return { ok: false, message: "안내 방법을 선택해 주세요." };
    }
    if (note.length < 2 || note.length > 1000) {
        return { ok: false, message: "안내 내용을 2자 이상 입력해 주세요." };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc(
        "admin_record_payment_incident_contact",
        {
            p_id: input.incidentId,
            p_method: input.method,
            p_note: note,
        },
    );
    if (error) {
        return { ok: false, message: "고객 안내 기록 저장에 실패했습니다." };
    }

    revalidatePath("/admin/payments");
    return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

export type CareResult = { ok: true } | { ok: false; message: string };

export type CareInput = {
    name: string;
    relation: string;
    gender: "male" | "female" | "";
    birth: string; // "YYYY-MM-DD" | ""
    phone: string;
};

const BIRTH_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 입력 정규화·검증 → DB 저장용 payload (실패 시 null) */
function toPayload(input: CareInput): {
    name: string;
    relation: string | null;
    gender: "male" | "female" | null;
    birth: string | null;
    phone: string | null;
} | null {
    const name = input.name.trim();
    if (!name) return null;
    const birth = input.birth.trim();
    if (birth && !BIRTH_RE.test(birth)) return null;
    const gender =
        input.gender === "male" || input.gender === "female"
            ? input.gender
            : null;
    return {
        name,
        relation: input.relation.trim() || null,
        gender,
        birth: birth || null,
        phone: input.phone.trim() || null,
    };
}

/** 환자 추가 */
export async function addCareRecipient(input: CareInput): Promise<CareResult> {
    const payload = toPayload(input);
    if (!payload) {
        return { ok: false, message: "이름을 확인해 주세요." };
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { error } = await supabase
        .from("care_recipients")
        .insert({ ...payload, user_id: user.id });

    if (error) {
        return {
            ok: false,
            message: "저장에 실패했습니다. 다시 시도해 주세요.",
        };
    }

    revalidatePath("/mypage/profile");
    return { ok: true };
}

/** 환자 수정 (본인 소유 RLS) */
export async function updateCareRecipient(
    id: string,
    input: CareInput,
): Promise<CareResult> {
    const payload = toPayload(input);
    if (!payload) {
        return { ok: false, message: "이름을 확인해 주세요." };
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { data, error } = await supabase
        .from("care_recipients")
        .update(payload)
        .eq("id", id)
        .select("id")
        .maybeSingle();

    if (error) {
        return {
            ok: false,
            message: "저장에 실패했습니다. 다시 시도해 주세요.",
        };
    }
    if (!data) {
        return { ok: false, message: "환자 정보를 찾을 수 없습니다." };
    }

    revalidatePath("/mypage/profile");
    return { ok: true };
}

/** 환자 삭제 (본인 소유 RLS) */
export async function deleteCareRecipient(id: string): Promise<CareResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { error } = await supabase
        .from("care_recipients")
        .delete()
        .eq("id", id);

    if (error) {
        return {
            ok: false,
            message: "삭제에 실패했습니다. 다시 시도해 주세요.",
        };
    }

    revalidatePath("/mypage/profile");
    return { ok: true };
}

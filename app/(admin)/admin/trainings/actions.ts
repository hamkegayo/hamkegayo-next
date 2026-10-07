"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/**
 * 파트너 교육 이수 확인 기록 (#255-3, 매뉴얼 10장).
 * 권한(심사 담당 + 2단계 인증)·입력 검증·감사 기록은 DB 함수가 한다.
 */

type Result = { ok: true } | { ok: false; message: string };

const MESSAGE: Record<string, string> = {
    forbidden: "심사 담당 권한과 2단계 인증이 필요합니다.",
    invalid_course: "교육 종류를 선택해 주세요.",
    invalid_date:
        "이수일을 확인해 주세요(오늘 이후 날짜는 입력할 수 없습니다).",
    evidence_required: "증빙 문서명 또는 관리번호를 2-200자로 입력해 주세요.",
    partner_not_found: "파트너를 찾을 수 없습니다.",
    reason_required: "삭제 사유를 5-300자로 입력해 주세요.",
    training_not_found: "이미 삭제된 기록입니다. 새로고침해 주세요.",
};

function toMessage(error: { message: string }): string {
    const key = Object.keys(MESSAGE).find((k) => error.message.includes(k));
    return key
        ? MESSAGE[key]
        : "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function recordPartnerTraining(input: {
    partnerId: string;
    course: string;
    completedOn: string;
    evidenceRef: string;
}): Promise<Result> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_record_partner_training", {
        p_partner: input.partnerId,
        p_course: input.course,
        p_completed_on: input.completedOn,
        p_evidence_ref: input.evidenceRef,
    });
    if (error) return { ok: false, message: toMessage(error) };
    revalidatePath("/admin/trainings");
    revalidatePath("/partner/status");
    return { ok: true };
}

export async function clearPartnerTraining(input: {
    partnerId: string;
    course: string;
    reason: string;
}): Promise<Result> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_clear_partner_training", {
        p_partner: input.partnerId,
        p_course: input.course,
        p_reason: input.reason,
    });
    if (error) return { ok: false, message: toMessage(error) };
    revalidatePath("/admin/trainings");
    revalidatePath("/partner/status");
    return { ok: true };
}

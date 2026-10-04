"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function setOpeningEvent(
    active: boolean,
    reason: string,
): Promise<{ ok: boolean; message: string }> {
    if (reason.trim().length < 5 || reason.length > 500)
        return { ok: false, message: "사유를 5~500자로 입력해 주세요." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_opening_event", {
        p_active: active,
        p_reason: reason.trim(),
    });
    if (error)
        return {
            ok: false,
            message:
                error.code === "23514"
                    ? "이메일 인증·고지·운영 검증이 준비되지 않았거나 종료된 이벤트입니다."
                    : "권한과 2단계 인증 상태를 확인해 주세요.",
        };
    revalidatePath("/");
    revalidatePath("/admin/campaigns/opening");
    return {
        ok: true,
        message: active
            ? "이벤트를 활성화했습니다."
            : "신규 혜택 배정을 중단했습니다.",
    };
}

export async function restoreOpeningEvent(claimId: string, reason: string) {
    if (
        !/^[a-f\d-]{36}$/i.test(claimId) ||
        reason.trim().length < 5 ||
        reason.length > 500
    )
        return { ok: false, message: "사유를 5~500자로 입력해 주세요." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_restore_opening_event", {
        p_claim_id: claimId,
        p_reason: reason.trim(),
    });
    if (error)
        return {
            ok: false,
            message: "권한·MFA·예약 취소 및 전액 환불 기록을 확인해 주세요.",
        };
    revalidatePath("/admin/campaigns/opening");
    return {
        ok: true,
        message: "귀책 사유를 기록하고 혜택 재사용을 허용했습니다.",
    };
}

export async function closeOpeningEvent(reason: string) {
    if (reason.trim().length < 5 || reason.length > 500)
        return { ok: false, message: "사유를 5~500자로 입력해 주세요." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_close_opening_event", {
        p_reason: reason.trim(),
    });
    if (error)
        return {
            ok: false,
            message: "권한·MFA와 진행 중인 결제 확보를 확인해 주세요.",
        };
    revalidatePath("/admin/campaigns/opening");
    revalidatePath("/");
    return {
        ok: true,
        message:
            "행사를 종료했습니다. 관련 처리 완료 후 중복 차단 식별값이 파기됩니다.",
    };
}

export async function excludeOpeningEvent(
    customerId: string,
    excluded: boolean,
    reason: string,
) {
    if (
        !/^[a-f\d-]{36}$/i.test(customerId) ||
        reason.trim().length < 5 ||
        reason.length > 500
    )
        return {
            ok: false,
            message: "회원 UUID와 사유 5~500자를 입력해 주세요.",
        };
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_exclude_opening_event", {
        p_customer_id: customerId,
        p_excluded: excluded,
        p_reason: reason.trim(),
    });
    if (error)
        return { ok: false, message: "회원과 권한·MFA를 확인해 주세요." };
    revalidatePath("/admin/campaigns/opening");
    return {
        ok: true,
        message: excluded
            ? "직원·테스트 계정을 제외했습니다."
            : "계정 제외를 해제했습니다.",
    };
}

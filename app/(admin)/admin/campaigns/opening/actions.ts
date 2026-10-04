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
                    ? "본인인증과 운영 조건이 아직 확정되지 않아 활성화할 수 없습니다."
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

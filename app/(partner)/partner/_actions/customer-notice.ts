"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { validateCustomerNoticeMemo } from "@/lib/direct-admin";

export type CustomerNoticeResult =
    { ok: true } | { ok: false; message: string };

/**
 * 파트너가 고객에게 확정 안내 문자를 직접 보낸 뒤 완료를 기록한다 (#300).
 * 자동 문자 발송은 하지 않는다. 담당 파트너 여부·열람 기간·멱등은 RPC(partner_record_customer_notice)가 DB 에서 검증하고
 * 완료 시각·수행자·메모·감사 이력을 남긴다. 클라이언트가 보낸 파트너 id 는 쓰지 않는다(auth.uid()).
 */
export async function recordCustomerNotice(input: {
    reservationId: string;
    memo?: string | null;
}): Promise<CustomerNoticeResult> {
    const checked = validateCustomerNoticeMemo(input.memo);
    if (!checked.ok) return checked;

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { error } = await supabase.rpc("partner_record_customer_notice", {
        p_reservation: input.reservationId,
        p_memo: checked.memo ?? undefined,
    });
    if (error) {
        const m = error.message ?? "";
        return {
            ok: false,
            message: m.includes("access_expired")
                ? "열람 기간이 지나 기록할 수 없습니다."
                : m.includes("not_assigned_partner") || error.code === "42501"
                  ? "담당 파트너로 확정된 예약만 기록할 수 있습니다. 배정이 변경됐을 수 있어요."
                  : m.includes("memo_too_long")
                    ? "메모는 500자까지 입력할 수 있습니다."
                    : "기록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }
    revalidatePath("/partner/management");
    return { ok: true };
}

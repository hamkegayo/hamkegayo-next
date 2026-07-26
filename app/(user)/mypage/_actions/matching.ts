"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

export type ConfirmPartnerResult =
    { ok: true } | { ok: false; message: string };

/** RPC 예외 메시지 → 사용자 안내 문구 */
const ERROR_MESSAGE: Record<string, string> = {
    reservation_not_found: "예약을 찾을 수 없습니다.",
    not_owner: "본인 예약만 선택할 수 있습니다.",
    not_matching: "이미 확정되었거나 마감된 예약입니다.",
    partner_not_applied: "선택할 수 없는 파트너입니다.",
};

/**
 * 파트너 최종 선택(매칭 확정).
 *  - confirm_reservation_partner RPC 로 CONFIRMED + 나머지 NOT_SELECTED 를 원자적으로 처리.
 */
export async function confirmPartner(
    reservationId: string,
    partnerId: string,
): Promise<ConfirmPartnerResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { ok: false, message: "로그인이 필요합니다." };
    }

    const { error } = await supabase.rpc("confirm_reservation_partner", {
        p_reservation_id: reservationId,
        p_partner_id: partnerId,
    });

    if (error) {
        const key = Object.keys(ERROR_MESSAGE).find((k) =>
            error.message.includes(k),
        );
        return {
            ok: false,
            message: key
                ? ERROR_MESSAGE[key]
                : "선택에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    revalidatePath(`/mypage/reservations/${reservationId}`);
    revalidatePath("/mypage");

    return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createNotification } from "@/lib/notifications";

export type SelectPartnerResult =
    { ok: true; paymentDeadline: string } | { ok: false; message: string };

export type CancelConfirmedResult =
    { ok: true } | { ok: false; message: string };

/** RPC 예외 메시지 → 사용자 안내 문구 */
const ERROR_MESSAGE: Record<string, string> = {
    reservation_not_found: "예약을 찾을 수 없습니다.",
    not_owner: "본인 예약만 선택할 수 있습니다.",
    not_matching: "이미 확정되었거나 마감된 예약입니다.",
    partner_not_applied: "선택할 수 없는 파트너입니다.",
    partner_unavailable:
        "선택하신 파트너가 같은 시간대에 다른 예약이 있습니다. 다른 파트너를 선택해 주세요.",
};

/**
 * 파트너 선택 — **확정이 아니다.**
 *
 *  약관 제9조 ④ : 파트너를 고르고 **선결제를 완료한 시점**에 예약이 확정된다.
 *  그래서 여기서는 상태를 MATCHING 으로 두고 결제 기한(30분)만 건다.
 *  CONFIRMED 전이는 승인 라우트가 finalize_payment() 로 처리한다.
 *
 *  ⚠️ #54 이전에는 `confirm_reservation_partner` 를 불러 이 자리에서 바로
 *     CONFIRMED 로 넘겼다(결제 없이 확정 = 제9조 ④ 위반). 그 RPC 는 이제 쓰지 않는다.
 *
 *  파트너 확정 알림도 여기서 보내지 않는다 — 결제가 끝나야 확정이므로
 *  알림은 승인 시점(#53)으로 옮겼다.
 */
export async function selectPartner(
    reservationId: string,
    partnerId: string,
): Promise<SelectPartnerResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { ok: false, message: "로그인이 필요합니다." };
    }

    const { data, error } = await supabase.rpc("select_reservation_partner", {
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

    // RPC 가 결제 기한(선택 시점 +30분)을 돌려준다.
    return { ok: true, paymentDeadline: (data as string) ?? "" };
}

/**
 * 확정(CONFIRMED) 예약 취소 — 서비스 시작 전(SCHEDULED)일 때만 허용.
 *  - 쿠키 클라(RLS)로 소유·상태 확인 후, admin 으로 예약 CANCELLED + 서비스 행 삭제.
 *  - 확정 파트너에게 취소 알림.
 */
export async function cancelConfirmedReservation(
    reservationId: string,
): Promise<CancelConfirmedResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { ok: false, message: "로그인이 필요합니다." };
    }

    // 소유·상태 확인 (RLS: 본인 예약만 조회됨)
    const { data: reservation } = await supabase
        .from("reservations")
        .select("id, status, confirmed_partner_id")
        .eq("id", reservationId)
        .maybeSingle();

    if (!reservation) {
        return { ok: false, message: "예약을 찾을 수 없습니다." };
    }
    if (reservation.status !== "CONFIRMED") {
        return { ok: false, message: "취소할 수 없는 예약입니다." };
    }

    const admin = createAdminClient();

    // 서비스가 이미 진행/완료면 취소 불가
    const { data: svc } = await admin
        .from("services")
        .select("id, status")
        .eq("reservation_id", reservationId)
        .maybeSingle();

    if (svc && svc.status !== "SCHEDULED") {
        return {
            ok: false,
            message: "이미 진행 중이거나 완료된 예약은 취소할 수 없습니다.",
        };
    }

    const { error: upErr } = await admin
        .from("reservations")
        .update({ status: "CANCELLED" })
        .eq("id", reservationId);
    if (upErr) {
        return {
            ok: false,
            message: "취소에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    // 예약된(SCHEDULED) 서비스 행 제거
    if (svc) {
        await admin.from("services").delete().eq("id", svc.id);
    }

    // 확정 파트너에게 취소 알림
    if (reservation.confirmed_partner_id) {
        await createNotification(reservation.confirmed_partner_id, {
            type: "RESERVATION_CANCELLED",
            title: "예약이 취소되었어요",
            body: "고객이 확정된 예약을 취소했습니다.",
            link: "/partner/management",
        });
    }

    revalidatePath(`/mypage/reservations/${reservationId}`);
    revalidatePath("/mypage");

    return { ok: true };
}

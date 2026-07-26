"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

export type RequestActionResult = { ok: true } | { ok: false; message: string };

/** 거절 모달에서 넘어오는 사유 코드값(reject-request-modal.tsx 와 동일) */
const REJECT_REASONS = ["time", "distance", "type", "personal", "etc"] as const;
type RejectReason = (typeof REJECT_REASONS)[number];

/**
 * 지원 기록 공통 처리.
 *  - 로그인/파트너 세션 검증(RLS insert 정책이 role=PARTNER 도 함께 확인)
 *  - 예약이 아직 MATCHING 인지 재검증(마감된 건 차단)
 *  - reservation_applications 에 INSERT (unique 제약으로 중복 수락/지원 차단)
 */
async function applyToReservation(
    reservationId: string,
    payload: {
        status: "ACCEPTED" | "REJECTED";
        reject_reason?: string;
        reject_note?: string | null;
    },
): Promise<RequestActionResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { ok: false, message: "로그인이 필요합니다." };
    }

    // 예약 상태 재검증 — RLS 상 파트너에게는 MATCHING(또는 본인 ACCEPTED)만 조회됨
    const { data: reservation } = await supabase
        .from("reservations")
        .select("id, status")
        .eq("id", reservationId)
        .maybeSingle();

    if (!reservation) {
        return { ok: false, message: "요청을 찾을 수 없습니다." };
    }
    if (reservation.status !== "MATCHING") {
        return { ok: false, message: "이미 마감된 요청입니다." };
    }

    const { error } = await supabase.from("reservation_applications").insert({
        reservation_id: reservationId,
        partner_id: user.id,
        ...payload,
    });

    if (error) {
        // unique(reservation_id, partner_id) 위반 → 이미 처리한 요청
        if (error.code === "23505") {
            return { ok: false, message: "이미 처리한 요청입니다." };
        }
        console.error("[applyToReservation] insert 실패:", error);
        return {
            ok: false,
            message: "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    // 목록/뱃지는 서버 컴포넌트이므로 재검증 시 해당 건이 제외되어 사라짐
    revalidatePath("/partner/requests");
    revalidatePath("/partner");

    return { ok: true };
}

/** 수락 — ACCEPTED 지원 기록(최종 확정은 고객 선택 #21) */
export async function acceptRequest(
    reservationId: string,
): Promise<RequestActionResult> {
    return applyToReservation(reservationId, { status: "ACCEPTED" });
}

/** 거절 — 사유(코드값) + 메모 저장 */
export async function rejectRequest(
    reservationId: string,
    reason: string,
    note: string,
): Promise<RequestActionResult> {
    if (!REJECT_REASONS.includes(reason as RejectReason)) {
        return { ok: false, message: "거절 사유를 선택해 주세요." };
    }
    const trimmed = note.trim().slice(0, 200);
    return applyToReservation(reservationId, {
        status: "REJECTED",
        reject_reason: reason,
        reject_note: trimmed.length > 0 ? trimmed : null,
    });
}

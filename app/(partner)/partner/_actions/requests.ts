"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createNotification } from "@/lib/notifications";

export type RequestActionResult = { ok: true } | { ok: false; message: string };

/** 거절 모달에서 넘어오는 사유 코드값(reject-request-modal.tsx 와 동일) */
const REJECT_REASONS = ["time", "distance", "type", "personal", "etc"] as const;
type RejectReason = (typeof REJECT_REASONS)[number];

/**
 * 지원 기록 공통 처리.
 *  - 로그인/파트너 세션 검증(RLS insert 정책이 role=PARTNER 도 함께 확인)
 *  - 예약이 아직 검토 단계인지 재검증(마감·거절된 건 차단)
 *  - reservation_applications 에 INSERT (unique 제약으로 중복 수락/지원 차단)
 *
 *  ⚠️ 예전에는 여기서 `reservations` 를 직접 읽어 status 를 확인했다.
 *     #66/#67 이 파트너의 예약 직접 조회 정책을 없앴기 때문에(확정 건만 열린다)
 *     그 방식은 MATCHING 예약을 못 찾아 수락 자체가 막힌다.
 *     검토 단계 판정은 `partner_in_review()` 가 단일 소스다 — 목록·상세 RPC 와 같은 기준.
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

    // 검토 단계인가 — MATCHING 이고, 이 파트너가 거절·미선택되지 않았는가.
    const { data: inReview, error: reviewError } = await supabase.rpc(
        "partner_in_review",
        { res_id: reservationId },
    );

    if (reviewError) {
        console.error("[applyToReservation] 검토 단계 확인 실패:", reviewError);
        return {
            ok: false,
            message: "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }
    if (!inReview) {
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

    // 수락 시 고객에게 알림(지원 파트너 발생 → 최종 선택 유도).
    // 고객 id 는 파트너에게 열려 있지 않으므로 서버 권한으로 읽는다.
    if (payload.status === "ACCEPTED") {
        const admin = createAdminClient();
        const { data: owner } = await admin
            .from("reservations")
            .select("customer_id")
            .eq("id", reservationId)
            .maybeSingle();

        if (owner?.customer_id) {
            await createNotification(owner.customer_id, {
                type: "PARTNER_APPLIED",
                title: "파트너가 요청을 수락했어요",
                body: "지원한 파트너를 확인하고 최종 선택해 주세요.",
                link: `/mypage/reservations/${reservationId}`,
            });
        }
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

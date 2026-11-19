"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import {
    directErrorMessage,
    validateAssignInput,
    validateFailureInput,
    validateFailureNoticeInput,
    type DirectActionResult,
} from "@/lib/direct-admin";
import { dispatchIntakeNotifications } from "@/lib/intake-notification.server";
import {
    failMatchingAndRefund,
    retryDirectRefund,
    type DirectRefundOutcome,
} from "@/lib/payments/direct-refund";

/**
 * 운영자 직접 배정 서버 액션 (#300).
 *
 *  ⚠️ 권한 — 여기서는 로그인만 확인하고, **관리자·MFA·duty 검증은 각 RPC(can_manage_reservations)가 DB 에서 한다.**
 *     클라이언트가 보낸 값(관리자 여부 포함)은 믿지 않는다. 전부 세션 클라이언트로 부르며 service_role 을 쓰지 않는다
 *     (환불 PG 호출만 lib/payments/direct-refund 가 서버 내부에서 service_role 로 이어 간다 — 시작 RPC 가 이미 권한을 검증한 뒤다).
 */

function refresh(reservationId: string) {
    revalidatePath("/admin/reservations");
    revalidatePath(`/admin/reservations/${reservationId}`);
    revalidatePath("/admin");
}

function refundMessage(r: DirectRefundOutcome): DirectActionResult {
    if (r.ok)
        return {
            ok: true,
            message: r.already
                ? "이미 환불이 완료된 건입니다."
                : "PG 전액 환불까지 완료했습니다.",
        };
    // PG 취소 실패는 환불 완료로 보이게 하지 않는다 — 예약은 닫혔고 환불은 재시도 대상이다.
    return {
        ok: true,
        message:
            r.code === "IN_PROGRESS"
                ? "환불이 처리 중입니다. 잠시 후 상태를 확인해 주세요."
                : "예약은 매칭 실패로 닫혔지만 PG 환불이 끝나지 않았습니다. 아래 환불 상태에서 재시도해 주세요.",
    };
}

async function requireSession() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user ? supabase : null;
}

const LOGIN_REQUIRED: DirectActionResult = {
    ok: false,
    message: "로그인이 필요합니다.",
};

/** 파트너 배정(최초) 또는 재배정. expectedAction 은 화면이 본 상태 — 그 사이 바뀌면 DB 가 거절한다. */
export async function assignPartnerAction(input: {
    reservationId: string;
    partnerId: string;
    channel: string;
    acceptanceConfirmed: boolean;
    memo?: string | null;
    expectedAction: "ASSIGN" | "REASSIGN";
}): Promise<DirectActionResult> {
    const checked = validateAssignInput(input);
    if (!checked.ok) return checked;

    const supabase = await requireSession();
    if (!supabase) return LOGIN_REQUIRED;

    const { data, error } = await supabase.rpc("admin_assign_partner", {
        p_reservation: input.reservationId,
        p_partner: input.partnerId,
        p_accepted_channel: checked.channel,
        p_accepted_memo: checked.memo ?? undefined,
        p_expected_action: input.expectedAction,
    });
    if (error) {
        return {
            ok: false,
            message: directErrorMessage(
                error,
                "배정에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            ),
        };
    }
    refresh(input.reservationId);
    const action = (data as { action?: string } | null)?.action;
    return {
        ok: true,
        message:
            action === "REASSIGNED"
                ? "담당 파트너를 변경했습니다. 새 담당자가 고객에게 확정 안내 문자를 보내야 합니다."
                : "파트너를 배정하고 예약을 확정했습니다.",
    };
}

/** 운영자 신규 접수 확인 — "내가 이 건을 봤다". */
export async function acknowledgeIntakeAction(input: {
    reservationId: string;
    memo?: string | null;
}): Promise<DirectActionResult> {
    const supabase = await requireSession();
    if (!supabase) return LOGIN_REQUIRED;
    const { error } = await supabase.rpc("admin_acknowledge_intake", {
        p_reservation: input.reservationId,
        p_memo: input.memo?.trim() || undefined,
    });
    if (error)
        return {
            ok: false,
            message: directErrorMessage(error, "접수 확인에 실패했습니다."),
        };
    refresh(input.reservationId);
    return { ok: true, message: "접수를 확인했습니다." };
}

/**
 * 접수 알림 메일 수동 재발송. RPC 가 권한·상태를 검증하고 큐에 다시 올리면 서버가 바로 발송을 시도한다.
 * 이미 발송된 건은 다시 보내지 않는다. 메일 설정이 없으면 큐에는 올라가지만 "성공"으로 기록하지 않는다.
 */
export async function resendIntakeEmailAction(input: {
    reservationId: string;
}): Promise<DirectActionResult> {
    const supabase = await requireSession();
    if (!supabase) return LOGIN_REQUIRED;
    const { data, error } = await supabase.rpc(
        "admin_requeue_intake_notification",
        {
            p_reservation: input.reservationId,
        },
    );
    if (error)
        return {
            ok: false,
            message: directErrorMessage(error, "재발송 요청에 실패했습니다."),
        };

    const state = data as string | null;
    if (state === "ALREADY_SENT")
        return {
            ok: true,
            message: "이미 메일이 발송된 건입니다. 다시 보내지 않았어요.",
        };
    if (state === "IN_PROGRESS")
        return {
            ok: true,
            message: "다른 요청이 발송 중입니다. 잠시 후 확인해 주세요.",
        };
    if (state === "NOT_WAITING")
        return {
            ok: false,
            message: "배정 대기 중인 예약만 재발송할 수 있습니다.",
        };

    const result = await dispatchIntakeNotifications(1);
    refresh(input.reservationId);
    if (result.skipped)
        return {
            ok: false,
            message:
                result.skipped === "NO_RECIPIENT"
                    ? "운영자 수신 주소(PAYMENT_ALERT_EMAIL)가 설정되지 않아 보내지 못했습니다. 설정 후 다시 시도해 주세요."
                    : "이메일 발송 키(RESEND_API_KEY)가 설정되지 않아 보내지 못했습니다(모의 발송은 성공으로 치지 않습니다).",
        };
    if (result.sent > 0)
        return { ok: true, message: "접수 알림 메일을 발송했습니다." };
    return {
        ok: false,
        message:
            "메일 발송에 실패했습니다. 잠시 후 자동으로 다시 시도하며, 상태는 상세 화면에서 확인할 수 있습니다.",
    };
}

/** 매칭 실패 처리 + PG 전액 환불. 고객 안내는 별도 기록(recordFailureNoticeAction). */
export async function failMatchingAction(input: {
    reservationId: string;
    reason: string;
    confirmed: boolean;
}): Promise<DirectActionResult> {
    const checked = validateFailureInput(input);
    if (!checked.ok) return checked;
    const supabase = await requireSession();
    if (!supabase) return LOGIN_REQUIRED;

    const result = await failMatchingAndRefund(
        supabase,
        input.reservationId,
        checked.reason,
    );
    refresh(input.reservationId);
    if (!result.ok) return { ok: false, message: result.message };
    return refundMessage(result.refund);
}

/** PG 취소 실패·중단 건 재시도. */
export async function retryRefundAction(input: {
    reservationId: string;
}): Promise<DirectActionResult> {
    const supabase = await requireSession();
    if (!supabase) return LOGIN_REQUIRED;
    const result = await retryDirectRefund(supabase, input.reservationId);
    refresh(input.reservationId);
    if (!result.ok) return { ok: false, message: result.message };
    return refundMessage(result.refund);
}

/** 운영자의 고객 실패 안내 완료 기록 — 환불 상태와 별개다. */
export async function recordFailureNoticeAction(input: {
    reservationId: string;
    method: string;
    confirmed: boolean;
    memo?: string | null;
}): Promise<DirectActionResult> {
    const checked = validateFailureNoticeInput(input);
    if (!checked.ok) return checked;
    const supabase = await requireSession();
    if (!supabase) return LOGIN_REQUIRED;
    const { error } = await supabase.rpc("admin_record_failure_notice", {
        p_reservation: input.reservationId,
        p_method: checked.method,
        p_memo: checked.memo ?? undefined,
    });
    if (error)
        return {
            ok: false,
            message: directErrorMessage(
                error,
                "안내 완료 기록에 실패했습니다.",
            ),
        };
    refresh(input.reservationId);
    return { ok: true, message: "고객 실패 안내 완료를 기록했습니다." };
}

/** PG 응답이 유실된 건 — 운영자가 PG 콘솔에서 취소를 확인한 뒤 기록한다(이중 취소 방지). */
export async function markRefundPgCancelledAction(input: {
    reservationId: string;
    memo: string;
}): Promise<DirectActionResult> {
    const supabase = await requireSession();
    if (!supabase) return LOGIN_REQUIRED;
    const { error } = await supabase.rpc("admin_mark_refund_pg_cancelled", {
        p_reservation: input.reservationId,
        p_memo: input.memo,
    });
    if (error)
        return {
            ok: false,
            message: directErrorMessage(
                error,
                "PG 취소 확인 기록에 실패했습니다.",
            ),
        };
    refresh(input.reservationId);
    return {
        ok: true,
        message:
            "PG 취소 확인을 기록했습니다. 환불 재시도로 원장 기록을 마무리해 주세요.",
    };
}

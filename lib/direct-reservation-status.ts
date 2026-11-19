/**
 * 신규 방식(#300) 고객 예약 상태 표시 — DB 값을 화면 문구로 옮긴다.
 *
 *  상태 enum 은 늘리지 않았으므로 아래 값의 조합으로 판정한다.
 *    결제 전        MATCHING + paid_at 없음
 *    매칭 대기      MATCHING + paid_at 있음           (결제 완료·파트너 배정 대기)
 *    확정           CONFIRMED / COMPLETED
 *    취소·환불      CANCELLED + reservation_refunds.status
 *
 *  ⚠️ 환불 완료는 REFUNDED 하나뿐이다. PG 취소 실패(PG_FAILED)·처리 중(REQUESTED/PROCESSING)을
 *     환불 완료로 보이게 하지 않는다.
 */

export type RefundStatus =
    "REQUESTED" | "PROCESSING" | "PG_FAILED" | "REFUNDED";
export type RefundReason = "CUSTOMER_CANCEL" | "MATCH_FAILED";

export type DirectPhase =
    | "UNPAID"
    | "WAITING"
    | "CONFIRMED"
    | "REFUND_IN_PROGRESS"
    | "REFUND_DELAYED"
    | "REFUNDED"
    | "CANCELLED_NO_PAYMENT";

export type DirectPhaseInput = {
    status: string;
    paidAt: string | null;
    refundStatus: RefundStatus | null;
};

export function directPhase(r: DirectPhaseInput): DirectPhase {
    if (r.status === "CONFIRMED" || r.status === "COMPLETED")
        return "CONFIRMED";
    if (r.status === "CANCELLED") {
        if (r.refundStatus === "REFUNDED") return "REFUNDED";
        if (r.refundStatus === "PG_FAILED") return "REFUND_DELAYED";
        if (r.refundStatus) return "REFUND_IN_PROGRESS";
        return "CANCELLED_NO_PAYMENT";
    }
    return r.paidAt ? "WAITING" : "UNPAID";
}

export const DIRECT_PHASE_LABEL: Record<DirectPhase, string> = {
    UNPAID: "결제 대기",
    WAITING: "결제 완료 · 파트너 배정 대기",
    CONFIRMED: "예약 확정",
    REFUND_IN_PROGRESS: "환불 진행 중",
    REFUND_DELAYED: "환불 처리 지연",
    REFUNDED: "환불 완료",
    CANCELLED_NO_PAYMENT: "예약 취소",
};

export function directPhaseDescription(
    phase: DirectPhase,
    reason: RefundReason | null,
): string {
    const failed = reason === "MATCH_FAILED";
    switch (phase) {
        case "UNPAID":
            return "아직 결제가 완료되지 않았습니다. 결제를 마치면 파트너 확인이 시작됩니다.";
        case "WAITING":
            return "결제가 완료되었고 동행 파트너를 확인하고 있습니다. 24시간 이내에 예약 진행 결과를 안내드립니다. 파트너 배정이 완료되면 예약이 최종 확정됩니다.";
        case "CONFIRMED":
            return "파트너 배정이 완료되어 예약이 확정되었습니다.";
        case "REFUND_IN_PROGRESS":
            return failed
                ? "파트너 배정이 어려워 결제하신 금액을 전액 환불하고 있습니다."
                : "예약이 취소되었고 결제하신 금액을 전액 환불하고 있습니다.";
        case "REFUND_DELAYED":
            return "예약은 취소되었지만 카드 취소가 아직 끝나지 않았습니다. 환불이 완료된 것이 아니며, 운영팀이 확인해 다시 처리합니다. 급하시면 고객센터로 문의해 주세요.";
        case "REFUNDED":
            return failed
                ? "파트너 배정이 어려워 결제하신 금액이 전액 환불되었습니다."
                : "예약이 취소되어 결제하신 금액이 전액 환불되었습니다.";
        case "CANCELLED_NO_PAYMENT":
            return "예약이 취소되었습니다.";
    }
}

/** 배정 전 고객 취소가 가능한가 — 파트너 배정(확정) 전이고 아직 취소·환불 중이 아닐 때만. */
export function canCancelBeforeAssignment(phase: DirectPhase): boolean {
    return phase === "UNPAID" || phase === "WAITING";
}

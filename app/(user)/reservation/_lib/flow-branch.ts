import type { MatchingMode } from "@/lib/direct-assignment";
import { OPENING_COUPON_CONFIRM_MESSAGES } from "@/lib/opening-coupon";

/**
 * 예약 흐름 분기 (#300).
 *
 *  신규 방식(admin_direct)은 파트너 지원 대기(STEP5)·고객 선택(STEP6) 없이 신청 확인(STEP4) 다음에
 *  바로 결제(STEP7)로 간다. 기존 방식(legacy_auto)은 종전 순서 그대로다.
 *  분기는 서버가 정해 돌려준 matchingMode 만 따른다(플래그를 껐다 켜도 이미 만든 예약은 자기 방식).
 */
export const STEP_MATCHING = 5;
export const STEP_PARTNER_SELECT = 6;
export const STEP_PAYMENT = 7;
export const STEP_COMPLETE = 8;

/** 화면 상단 진행 점·단계 수 (신규 방식 6단계, 기존 방식 8단계) */
export function totalStepsFor(mode: MatchingMode): 6 | 8 {
    return mode === "admin_direct" ? 6 : 8;
}

/** 결제 결과 코드 → 사용자 안내 문구 */
export const PAY_ERROR_MESSAGE: Record<string, string> = {
    INVALID_SIGNATURE: "결제 정보를 확인할 수 없습니다. 다시 시도해 주세요.",
    AMOUNT_MISMATCH:
        "결제 금액이 일치하지 않아 취소되었습니다. 다시 시도해 주세요.",
    PAYMENT_EXPIRED:
        "결제 시간이 지나 파트너 선택이 해제되었습니다. 다시 선택해 주세요.",
    UNKNOWN_ORDER: "결제 정보를 찾을 수 없습니다. 고객센터로 문의해 주세요.",
    CONFIRM_FAILED:
        "결제는 취소되었습니다. 예약이 확정되지 않았으니 다시 시도해 주세요.",
    // 오픈 이벤트 쿠폰이 결제 확정 시점에 거부된 경우 (#297). 결제 화면은 쿠폰 선택이 풀린 채 다시 열린다.
    ...OPENING_COUPON_CONFIRM_MESSAGES,
    PAYMENT_NOT_PENDING: "이미 처리된 결제입니다.",
    RESERVATION_DATE_OUT_OF_RANGE:
        "PG사 기준에 따라 결제일을 1일째로 계산해 60일 이내 날짜만 결제할 수 있습니다. 기존 예약을 취소하고 날짜를 다시 선택해 주세요.",
};

/** 결제 실패 코드에 따른 토스트 안내 문구 (신규 방식은 파트너 선택 해제가 아니다) */
export function paymentErrorMessage(code: string, mode: MatchingMode): string {
    if (code === "PAYMENT_EXPIRED" && mode === "admin_direct") {
        return "결제 유효 시간이 지났습니다. 다시 결제를 진행해 주세요.";
    }
    return (
        PAY_ERROR_MESSAGE[code] ?? "결제에 실패했습니다. 다시 시도해 주세요."
    );
}

/** 예약 등록 직후 이동할 단계 */
export function stepAfterRegistration(mode: MatchingMode): 5 | 7 {
    return mode === "admin_direct" ? STEP_PAYMENT : STEP_MATCHING;
}

export type ResumeInput = {
    matchingMode: MatchingMode;
    status: string;
    paidAt: string;
    partnerId: string;
};

/**
 * 결제창에서 돌아오거나 마이페이지에서 이어갈 때 보여줄 단계.
 *  "mypage" 는 이 화면에서 이어갈 수 없는 예약(취소됨)이라 예약 현황으로 보낸다.
 */
export function resumeStepFor(s: ResumeInput): 6 | 7 | 8 | "mypage" {
    if (s.matchingMode === "admin_direct") {
        if (s.status === "CANCELLED") return "mypage";
        // 결제가 끝났다 — 확정이 아니라 매칭 대기 안내(완료 화면)다.
        if (s.paidAt || s.status !== "MATCHING") return STEP_COMPLETE;
        return STEP_PAYMENT;
    }
    if (s.status === "CONFIRMED") return STEP_COMPLETE;
    if (s.partnerId) return STEP_PAYMENT;
    return STEP_PARTNER_SELECT;
}

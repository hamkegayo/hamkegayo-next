/**
 * 운영자 직접 배정 화면(#300)의 순수 규칙 — 입력 검증·오류 문구·상태 판정.
 *
 *  서버 액션과 화면이 같은 규칙을 쓰도록 분리한다. 권한·상태·일정 충돌의 **최종 검증은 DB RPC** 가 한다.
 *  여기의 검증은 잘못된 요청을 일찍 돌려보내 안내 문구를 주기 위한 것이다.
 *
 *  ⚠️ 24시간 경과는 **경고만** 한다. 자동 실패·자동 환불은 어디에도 없다(사용자 확정).
 */

export const ACCEPT_CHANNELS = ["PHONE", "SMS", "KAKAO", "OTHER"] as const;
export type AcceptChannel = (typeof ACCEPT_CHANNELS)[number];
export const ACCEPT_CHANNEL_LABEL: Record<AcceptChannel, string> = {
    PHONE: "전화",
    SMS: "문자",
    KAKAO: "카카오톡",
    OTHER: "기타",
};

export const FAILURE_NOTICE_METHODS = [
    "PHONE",
    "SMS",
    "KAKAO",
    "EMAIL",
    "OTHER",
] as const;
export type FailureNoticeMethod = (typeof FAILURE_NOTICE_METHODS)[number];
export const FAILURE_NOTICE_METHOD_LABEL: Record<FailureNoticeMethod, string> =
    {
        PHONE: "전화",
        SMS: "문자",
        KAKAO: "카카오톡",
        EMAIL: "이메일",
        OTHER: "기타",
    };

export const MEMO_MAX = 500;
export const OVERDUE_HOURS = 24;

export type DirectActionResult =
    { ok: true; message?: string } | { ok: false; message: string };

// ---------- 오류 문구 ----------

/** RPC 가 던지는 예외 문구(message) → 운영자에게 보일 안내 */
const RPC_ERROR_MESSAGE: Record<string, string> = {
    forbidden: "권한이 없습니다. 관리자 권한과 2단계 인증을 확인해 주세요.",
    reservation_not_found: "예약을 찾을 수 없습니다.",
    not_assignable:
        "지금은 배정할 수 없는 상태입니다. 이미 취소·환불되었거나 서비스가 끝난 예약일 수 있어요. 새로고침해 확인해 주세요.",
    state_changed:
        "다른 운영자가 이미 이 예약을 처리했습니다. 새로고침해 현재 상태를 확인해 주세요.",
    payment_not_paid:
        "결제가 완료된 예약만 배정할 수 있습니다. 결제 취소·환불이 진행 중이면 배정할 수 없어요.",
    same_partner:
        "현재 담당 파트너와 같은 사람입니다. 다른 파트너를 선택해 주세요.",
    service_already_started:
        "서비스가 이미 시작되어 재배정할 수 없습니다. 시작 후에는 담당 파트너를 바꿀 수 없어요.",
    start_time_passed:
        "예약 시작 시각이 이미 지났습니다. 배정하지 말고 매칭 실패로 처리해 환불해 주세요.",
    partner_not_active:
        "활동 중인 파트너가 아닙니다. 다른 파트너를 선택해 주세요.",
    training_required: "필수 교육을 마치지 않은 파트너입니다.",
    partner_unavailable:
        "선택한 파트너의 다른 일정과 시간이 겹칩니다. 다른 파트너를 선택해 주세요.",
    invalid_accept_channel: "수락 확인 방법을 선택해 주세요.",
    invalid_accepted_at: "수락 시각이 올바르지 않습니다.",
    memo_too_long: `메모는 ${MEMO_MAX}자까지 입력할 수 있습니다.`,
    not_match_failed: "매칭 실패로 처리된 예약에만 기록할 수 있습니다.",
    invalid_method: "안내 방법을 선택해 주세요.",
    invalid_memo: "확인 내용을 5자 이상 500자 이하로 적어 주세요.",
    refund_not_found: "환불 정보를 찾을 수 없습니다.",
    refund_not_markable:
        "이미 완료됐거나 다른 요청이 처리 중인 환불입니다. 잠시 후 다시 확인해 주세요.",
    intake_not_found: "접수 기록을 찾을 수 없습니다.",
};

export function directErrorMessage(
    error: { message?: string | null; code?: string | null } | null | undefined,
    fallback: string,
): string {
    const message = error?.message?.trim() ?? "";
    for (const [key, text] of Object.entries(RPC_ERROR_MESSAGE)) {
        if (message === key || message.includes(key)) return text;
    }
    if (error?.code === "42501") return RPC_ERROR_MESSAGE.forbidden;
    return fallback;
}

// ---------- 입력 검증 ----------

function cleanMemo(raw: string | null | undefined): string | null {
    const memo = (raw ?? "").trim();
    return memo ? memo : null;
}

export type AssignInput = {
    reservationId: string;
    partnerId: string;
    channel: string;
    /** 외부 연락으로 파트너 수락을 직접 확인했다는 체크 */
    acceptanceConfirmed: boolean;
    memo?: string | null;
    expectedAction?: "ASSIGN" | "REASSIGN" | null;
};

export function validateAssignInput(
    input: AssignInput,
):
    | { ok: true; channel: AcceptChannel; memo: string | null }
    | { ok: false; message: string } {
    if (!input.reservationId || !input.partnerId)
        return { ok: false, message: "배정할 파트너를 선택해 주세요." };
    if (!input.acceptanceConfirmed)
        return {
            ok: false,
            message:
                "파트너에게 외부 연락(전화·문자 등)으로 수락 의사를 확인했는지 체크해 주세요.",
        };
    if (!(ACCEPT_CHANNELS as readonly string[]).includes(input.channel))
        return { ok: false, message: RPC_ERROR_MESSAGE.invalid_accept_channel };
    const memo = cleanMemo(input.memo);
    if (memo && memo.length > MEMO_MAX)
        return { ok: false, message: RPC_ERROR_MESSAGE.memo_too_long };
    return { ok: true, channel: input.channel as AcceptChannel, memo };
}

export function validateFailureInput(input: {
    confirmed: boolean;
    reason: string;
}): { ok: true; reason: string } | { ok: false; message: string } {
    const reason = input.reason.trim();
    if (!input.confirmed)
        return {
            ok: false,
            message:
                "매칭 실패 처리와 전액 환불에 동의하는지 체크해 주세요. 되돌릴 수 없습니다.",
        };
    if (reason.length < 2 || reason.length > MEMO_MAX)
        return {
            ok: false,
            message: `실패 사유를 2자 이상 ${MEMO_MAX}자 이하로 적어 주세요.`,
        };
    return { ok: true, reason };
}

export function validateFailureNoticeInput(input: {
    confirmed: boolean;
    method: string;
    memo?: string | null;
}):
    | { ok: true; method: FailureNoticeMethod; memo: string | null }
    | { ok: false; message: string } {
    if (!input.confirmed)
        return {
            ok: false,
            message: "고객에게 실패 안내를 마쳤는지 체크해 주세요.",
        };
    if (!(FAILURE_NOTICE_METHODS as readonly string[]).includes(input.method))
        return { ok: false, message: RPC_ERROR_MESSAGE.invalid_method };
    const memo = cleanMemo(input.memo);
    if (memo && memo.length > MEMO_MAX)
        return { ok: false, message: RPC_ERROR_MESSAGE.memo_too_long };
    return { ok: true, method: input.method as FailureNoticeMethod, memo };
}

export function validateCustomerNoticeMemo(
    raw: string | null | undefined,
): { ok: true; memo: string | null } | { ok: false; message: string } {
    const memo = cleanMemo(raw);
    if (memo && memo.length > MEMO_MAX)
        return { ok: false, message: RPC_ERROR_MESSAGE.memo_too_long };
    return { ok: true, memo };
}

// ---------- 상태 판정 ----------

/** 결제 후 경과 분 → "3시간 20분" */
export function formatElapsed(minutes: number | null | undefined): string {
    if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "-";
    if (minutes < 60) return `${Math.floor(minutes)}분`;
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    if (h < 24) return m ? `${h}시간 ${m}분` : `${h}시간`;
    const d = Math.floor(h / 24);
    const rest = h % 24;
    return rest ? `${d}일 ${rest}시간` : `${d}일`;
}

/** 결제 후 24시간이 지났는가. 경고 표시 전용 — 어떤 자동 처리도 이 값으로 하지 않는다. */
export function isOverdueSincePaid(
    paidAt: string | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!paidAt) return false;
    const t = Date.parse(paidAt);
    if (!Number.isFinite(t)) return false;
    return now.getTime() - t > OVERDUE_HOURS * 60 * 60 * 1000;
}

export type NotifyStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

/** 운영자 이메일 알림 상태 표시. 발송(SENT)과 운영자 접수 확인은 별개다. */
export function intakeNotifyLabel(
    status: string | null | undefined,
    attempts = 0,
): { label: string; tone: "ok" | "warn" | "bad" | "neutral" } {
    switch (status) {
        case "SENT":
            return { label: "메일 발송됨", tone: "ok" };
        case "FAILED":
            return {
                label:
                    attempts >= 8
                        ? "메일 발송 실패 (자동 재시도 중단)"
                        : "메일 발송 실패 (재시도 예정)",
                tone: "bad",
            };
        case "SENDING":
            return { label: "메일 발송 중", tone: "neutral" };
        case "PENDING":
            return { label: "메일 발송 대기", tone: "warn" };
        default:
            return { label: "알림 기록 없음", tone: "neutral" };
    }
}

/** 수동 재발송 버튼을 보일 상태 — 이미 발송된 건은 다시 보내지 않는다. */
export function canResendIntake(status: string | null | undefined): boolean {
    return status === "PENDING" || status === "FAILED" || status === "SENDING";
}

export type DirectDetailState = {
    reservationStatus: string;
    confirmedPartnerId: string | null;
    paidAt: string | null;
    serviceStatus: string | null;
    serviceStartedAt: string | null;
    refundStatus: string | null;
};

/** 화면이 보여 줄 처리 단계. 서버 RPC 가 같은 기준으로 다시 검증한다. */
export type DirectAdminPhase =
    "ASSIGNABLE" | "REASSIGNABLE" | "STARTED" | "FAILED" | "OTHER";

export function directAdminPhase(s: DirectDetailState): DirectAdminPhase {
    if (s.reservationStatus === "CANCELLED") return "FAILED";
    if (
        s.reservationStatus === "MATCHING" &&
        s.paidAt &&
        !s.confirmedPartnerId &&
        !s.refundStatus
    )
        return "ASSIGNABLE";
    if (s.reservationStatus === "CONFIRMED" && s.confirmedPartnerId) {
        if (s.serviceStatus === "SCHEDULED" && !s.serviceStartedAt)
            return "REASSIGNABLE";
        return "STARTED";
    }
    return "OTHER";
}

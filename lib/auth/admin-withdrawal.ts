/**
 * 회원 탈퇴 — 본인 탈퇴·운영자 탈퇴(#293)가 함께 쓰는 순수 검증·문구 모듈.
 *
 * DB·Next 의존성이 없어 단위 테스트에서 그대로 불러온다.
 * DB 쪽 판정(마이그레이션 118 `admin_find_member_for_withdrawal` · `admin_withdraw_member`)과
 * 같은 기준을 화면에서 먼저 걸러 불필요한 호출·접속기록을 줄이기 위한 것이다.
 * 최종 판정은 항상 DB 가 한다.
 */

/** 운영자 탈퇴 사유 길이(DB `invalid_reason` 기준과 같다) */
export const WITHDRAWAL_REASON_MIN = 5;
export const WITHDRAWAL_REASON_MAX = 500;

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS_RE = /^[0-9 ()+-]+$/;

export type MemberLookupQuery =
    | { kind: "uuid"; value: string }
    | { kind: "email"; value: string }
    | { kind: "phone"; value: string }
    | { kind: "invalid" };

/**
 * 검색어를 정확 일치 형식(회원 UUID · 이메일 · 휴대전화번호) 중 하나로 분류한다.
 * 부분 문자열·이름 검색은 열지 않는다 — 개인정보처리방침 제13조(접근권한 관리), 최소 열람.
 */
export function classifyMemberLookupQuery(raw: string): MemberLookupQuery {
    const q = (raw ?? "").trim();
    if (!q) return { kind: "invalid" };
    if (UUID_RE.test(q)) return { kind: "uuid", value: q.toLowerCase() };
    if (q.indexOf("@") > 0 && q.length <= 200 && EMAIL_RE.test(q))
        return { kind: "email", value: q.toLowerCase() };
    if (PHONE_CHARS_RE.test(q)) {
        const digits = q.replace(/[^0-9]/g, "");
        if (/^[0-9]{9,11}$/.test(digits))
            return { kind: "phone", value: digits };
    }
    return { kind: "invalid" };
}

export type ReasonCheck =
    { ok: true; reason: string } | { ok: false; message: string };

/** 처리 근거를 앞뒤 공백을 지운 뒤 5-500자로 검증한다. */
export function normalizeWithdrawalReason(raw: string): ReasonCheck {
    const reason = (raw ?? "").trim();
    if (
        reason.length < WITHDRAWAL_REASON_MIN ||
        reason.length > WITHDRAWAL_REASON_MAX
    )
        return {
            ok: false,
            message: `처리 근거를 ${WITHDRAWAL_REASON_MIN}-${WITHDRAWAL_REASON_MAX}자로 입력해 주세요.`,
        };
    return { ok: true, reason };
}

/** 본인 탈퇴 — `withdraw_member` 가 던지는 거절 사유 → 회원 안내 (#72) */
export const WITHDRAW_BLOCKER_MESSAGE: Record<string, string> = {
    UNPAID_CHARGE:
        "결제되지 않은 추가 요금이 있어 탈퇴할 수 없습니다. 마이페이지에서 결제를 완료한 뒤 다시 시도해 주세요.",
    ACTIVE_RESERVATION:
        "진행 예정인 예약이 있어 탈퇴할 수 없습니다. 예약을 취소하거나 이용을 마친 뒤 다시 시도해 주세요.",
    ACTIVE_SERVICE:
        "맡고 계신 서비스가 남아 있어 탈퇴할 수 없습니다. 수행을 마친 뒤 다시 시도해 주세요.",
    PENDING_SETTLEMENT:
        "지급되지 않은 정산금이 남아 있어 탈퇴할 수 없습니다. 고객센터로 문의해 주세요.",
    PROFILE_NOT_FOUND: "회원 정보를 찾을 수 없습니다.",
};

/** 운영자 탈퇴 — 차단 사유 배지 */
export const WITHDRAW_BLOCKER_LABEL: Record<string, string> = {
    UNPAID_CHARGE: "미납 추가결제",
    ACTIVE_RESERVATION: "진행 예정 예약",
    ACTIVE_SERVICE: "진행 중·예정 서비스",
    PENDING_SETTLEMENT: "미지급 정산",
};

/** 운영자 탈퇴 — RPC 오류 → 운영자 안내 */
export const ADMIN_WITHDRAW_ERROR_MESSAGE: Record<string, string> = {
    UNPAID_CHARGE:
        "기한이 지난 미납 추가결제가 있어 탈퇴 처리할 수 없습니다. 회원에게 결제를 안내해 주세요.",
    ACTIVE_RESERVATION:
        "진행 예정인 예약(매칭 대기·확정)이 있어 탈퇴 처리할 수 없습니다. 예약 취소 또는 이용 완료 후 다시 시도해 주세요.",
    ACTIVE_SERVICE:
        "파트너가 맡은 예정·진행 중 서비스가 있어 탈퇴 처리할 수 없습니다. 수행 완료 또는 재배정 후 다시 시도해 주세요.",
    PENDING_SETTLEMENT:
        "지급되지 않은 정산금이 있어 탈퇴 처리할 수 없습니다. 정산 지급을 마친 뒤 다시 시도해 주세요.",
    PROFILE_NOT_FOUND: "회원 정보를 찾을 수 없습니다.",
    ADMIN_NOT_ALLOWED:
        "관리자 계정과 본인 계정은 이 화면에서 탈퇴 처리할 수 없습니다.",
    ALREADY_WITHDRAWN: "이미 탈퇴 처리된 회원입니다. 새로고침해 주세요.",
    SOCIAL_UNLINK_NOT_FOUND:
        "연결 해제 건이 이미 처리됐습니다. 새로고침해 주세요.",
    SOCIAL_UNLINK_USER_MISMATCH:
        "연결 해제 건의 회원과 탈퇴 대상 회원이 다릅니다.",
    NOT_WITHDRAWN: "탈퇴 처리된 회원이 아닙니다. 새로고침해 주세요.",
    intent_not_confirmed:
        "고객문의 채널로 회원 본인의 탈퇴 의사를 확인한 경우에만 처리할 수 있습니다.",
    invalid_reason: `처리 근거를 ${WITHDRAWAL_REASON_MIN}-${WITHDRAWAL_REASON_MAX}자로 입력해 주세요.`,
    invalid_input: "탈퇴 대상 회원이 올바르지 않습니다.",
    invalid_query:
        "이메일·휴대전화번호·회원 UUID 중 하나를 정확히 입력해 주세요.",
    forbidden:
        "활성 관리자 권한과 2단계 인증이 필요합니다(비밀번호 변경 완료 필요). 다시 로그인해 주세요.",
};

export const ADMIN_WITHDRAW_FALLBACK_MESSAGE =
    "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";

/** RPC 오류 메시지(예외 이름)를 운영자 안내로 바꾼다. 모르는 오류는 일반 문구. */
export function adminWithdrawErrorMessage(
    error: { message?: string | null } | null | undefined,
): string {
    const key = error?.message?.trim() ?? "";
    return ADMIN_WITHDRAW_ERROR_MESSAGE[key] ?? ADMIN_WITHDRAW_FALLBACK_MESSAGE;
}

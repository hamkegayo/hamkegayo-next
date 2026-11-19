/**
 * 대리 예약 이용자 본인 동의 · 대리 동의 사유·권한 확인 (#306)
 *
 * 개인정보처리방침 제10조:
 *   ① 보호자·가족이 대신 예약해도 민감정보 제공·전달은 원칙적으로 이용자 본인의 동의를 받는다.
 *   ② 이용자 본인에게 동의 사실을 안내하고 확인할 수 있는 수단을 제공한다.
 *   ③ 이용자가 의사능력 제한 등으로 직접 동의할 수 없는 경우에 한해 보호자 대리 동의를 허용하고
 *      사유와 대리 권한 확인을 기록한다.
 *   ④ 진료·검사 내용의 보호자 전달은 실제 이용자가 동의한 범위에서만 한다.
 *
 * 클라이언트·서버 공용 상수와 판정 함수만 둔다 (서버 전용 로직은 *.server.ts).
 */

/** 본인 예약 판별 기준 — 예약 1단계 관계 선택값 (RELATION_OPTIONS 의 첫 항목) */
export const SELF_RELATION = "본인";

export function isSelfRelation(relation: string | undefined | null): boolean {
    return relation === SELF_RELATION;
}

/** 동의 주체. DB reservations.user_consent_mode 와 같은 값 */
export type UserConsentMode = "SELF" | "USER_DIRECT" | "GUARDIAN_PROXY";
/** 대리 예약에서 보호자가 고르는 방식 (본인 예약은 선택지가 없다) */
export type ProxyConsentChoice = "USER_DIRECT" | "GUARDIAN_PROXY";
/** DB reservations.user_consent_status 와 같은 값 */
export type UserConsentStatus = "NOT_REQUIRED" | "PENDING_USER" | "CONFIRMED";

export const PROXY_REASON_OPTIONS = [
    {
        value: "LACKS_CAPACITY",
        label: "의사능력 제한 (인지·판단 능력 저하 등)",
    },
    {
        value: "CANNOT_OPERATE",
        label: "고령·질환 등으로 직접 확인·조작이 불가능",
    },
    {
        value: "OTHER_LEGAL_OR_DE_FACTO",
        label: "기타 법정·사실상 대리 사유",
    },
] as const;

export type ProxyReasonCode = (typeof PROXY_REASON_OPTIONS)[number]["value"];

export const PROXY_REASON_CODES = PROXY_REASON_OPTIONS.map((o) => o.value) as [
    ProxyReasonCode,
    ...ProxyReasonCode[],
];

/** DB 체크 제약(reservations_user_consent_check)과 같은 범위 */
export const PROXY_REASON_DETAIL_MIN = 10;
export const PROXY_REASON_DETAIL_MAX = 500;

/** 본인 동의 토큰 재확인 시 입력 길이 */
export const CONSENT_PHONE_LAST4_LENGTH = 4;

/** 예약 입력이 가리키는 동의 주체. 본인 관계면 선택값과 무관하게 SELF 다. */
export function resolveConsentMode(input: {
    relation?: string | null;
    consentMode?: string | null;
}): UserConsentMode | null {
    if (isSelfRelation(input.relation)) return "SELF";
    if (
        input.consentMode === "USER_DIRECT" ||
        input.consentMode === "GUARDIAN_PROXY"
    ) {
        return input.consentMode;
    }
    return null;
}

/** 연락처에서 끝 4자리 숫자 */
export function phoneLast4(phone: string): string {
    return phone.replace(/\D/g, "").slice(-CONSENT_PHONE_LAST4_LENGTH);
}

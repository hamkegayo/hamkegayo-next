/**
 * 선결제 후 운영자 직접 배정 흐름 피처 플래그 (#300).
 *
 *  신규 예약의 처리 방식을 정한다.
 *    legacy_auto  — 파트너 지원 → 고객 선택 → 결제 → 확정 (기존)
 *    admin_direct — 선결제(미배정) → 매칭 대기 → 운영자 직접 배정 → 확정 (신규)
 *
 *  사용법
 *    (미설정·true·그 외 값)                      기본값 — 신규 예약을 선결제 후 운영자 직접 배정 방식으로 만든다
 *    NEXT_PUBLIC_DIRECT_ASSIGNMENT_FLOW=false   비상 되돌리기 / 기존 흐름 회귀 E2E 테스트 전용
 *
 *  - 서버와 클라이언트가 같은 변수를 읽는다. `NEXT_PUBLIC_` 값은 **빌드 시점에 인라인**되므로
 *    값을 바꾼 뒤에는 dev 서버 재시작(운영은 재배포)이 필요하다. 서버만 켜고 클라이언트를 빼먹는
 *    불일치가 생기지 않게 변수를 하나만 둔다.
 *  - **이미 만든 예약은 플래그와 무관하다.** 예약의 `matching_mode` 컬럼이 처리 방식을 정하고,
 *    이후 모든 서버·DB 처리는 그 값을 따른다. 플래그를 껐다 켜도 기존 예약의 선택·결제·만료
 *    처리는 바뀌지 않는다.
 *
 *  ⚠️ 약관 제9조 ④⑤ 와 순서가 다르다. 운영 출시 전 약관 개정·고지가 필요하다.
 */

export type MatchingMode = "legacy_auto" | "admin_direct";

/** 기본 방식 — 신규 예약은 별도 환경변수 없이 바로 선결제 후 운영자 직접 배정 흐름을 따른다. */
const DEFAULT: MatchingMode = "admin_direct";

/** 플래그 값 해석 — 테스트와 호출부가 같은 규칙을 쓰도록 분리한다. */
export function parseDirectAssignmentFlag(
    raw: string | undefined | null,
): MatchingMode {
    const value = raw?.trim().toLowerCase();
    if (value === "1" || value === "true" || value === "on")
        return "admin_direct";
    if (value === "0" || value === "false" || value === "off")
        return "legacy_auto";
    return DEFAULT;
}

/**
 * 지금 새로 만드는 예약의 처리 방식.
 * ⚠️ `process.env.NEXT_PUBLIC_…` 를 **그대로 적어야** 클라이언트 번들에 인라인된다.
 */
export function newReservationMatchingMode(): MatchingMode {
    return parseDirectAssignmentFlag(
        process.env.NEXT_PUBLIC_DIRECT_ASSIGNMENT_FLOW,
    );
}

/** 저장된 예약의 방식. 컬럼이 없던 시절의 행(undefined/null)은 기존 방식이다. */
export function matchingModeOf(value: string | null | undefined): MatchingMode {
    return value === "admin_direct" ? "admin_direct" : "legacy_auto";
}

export function isAdminDirect(value: string | null | undefined): boolean {
    return matchingModeOf(value) === "admin_direct";
}

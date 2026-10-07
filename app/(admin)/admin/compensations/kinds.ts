/** 보상 사유 (DB point_compensations.kind 와 같은 값) — 약관 제16조 ⑧ · 제19조 ③ */
export const KIND_LABEL: Record<string, string> = {
    PARTNER_LAST_MINUTE_CANCEL: "파트너 직전 취소",
    PARTNER_LATE: "파트너 20분 이상 지각",
    PARTNER_NO_SHOW: "파트너 노쇼",
    NOT_PROVIDED: "회사·파트너 귀책 미제공",
};

/** 1회 지급 상한 (사용자 결정 2026-10-07). DB 제약과 같은 값이다. */
export const MAX_COMPENSATION = 100_000;

/**
 * 귀책 보상 지급 운영 보류 (2026-10-07 사용자 결정, PR #258 리뷰).
 * 지급 대상·실명 노출·보상 기준 공개가 정해지기 전까지 화면·액션을 닫는다.
 * DB 함수 실행 권한도 마이그레이션 97 에서 회수했다 — 다시 열 때 함께 되돌린다.
 */
export const COMPENSATION_ENABLED = false;

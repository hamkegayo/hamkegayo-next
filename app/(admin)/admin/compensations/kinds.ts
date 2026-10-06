/** 보상 사유 (DB point_compensations.kind 와 같은 값) — 약관 제16조 ⑧ · 제19조 ③ */
export const KIND_LABEL: Record<string, string> = {
    PARTNER_LAST_MINUTE_CANCEL: "파트너 직전 취소",
    PARTNER_LATE: "파트너 20분 이상 지각",
    PARTNER_NO_SHOW: "파트너 노쇼",
    NOT_PROVIDED: "회사·파트너 귀책 미제공",
};

/** 1회 지급 상한 (사용자 결정 2026-10-07). DB 제약과 같은 값이다. */
export const MAX_COMPENSATION = 100_000;

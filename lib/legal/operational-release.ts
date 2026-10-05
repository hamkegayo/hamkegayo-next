/** 사용자 확정: 공고일 2026-10-05, 시행일은 실제 main 배포일. */
export const OPERATIONAL_NOTICE_ANNOUNCED_DATE = "2026년 10월 5일";

export function operationalNoticeEffectiveDate(
    raw = process.env.POLICY_RELEASE_EFFECTIVE_DATE,
    environment = process.env.VERCEL_ENV,
): string {
    const valid =
        raw &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
        Number.isFinite(Date.parse(`${raw}T00:00:00Z`)) &&
        new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) === raw;
    if (!valid) {
        if (environment === "production")
            throw new Error(
                "POLICY_RELEASE_EFFECTIVE_DATE must be the confirmed main release date (YYYY-MM-DD)",
            );
        return "시행 예정 · 날짜 확정 후 안내";
    }
    const [year, month, day] = raw.split("-");
    return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

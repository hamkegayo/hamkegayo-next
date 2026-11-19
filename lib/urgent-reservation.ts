import { toHhmm } from "@/lib/format";

/**
 * 급한 예약 판정 (#300) — 예약 희망 시각까지 24시간 미만이면 전화 상담을 강조한다.
 *
 *  - 기준 시각은 한국 시간(Asia/Seoul)이다. 예약 입력의 날짜·시각은 KST 벽시계 값이고,
 *    서버(UTC)·브라우저(임의 시간대) 어디서 계산해도 같은 결과가 나오도록 `+09:00` 으로 고정해 해석한다.
 *  - 경계: 정확히 24시간 남았으면 급한 예약이 아니다(24시간 **미만**만 해당). 이미 지난 시각도 급한 예약이다.
 *  - 급한 예약이어도 온라인 결제는 막지 않는다. 안내만 강조한다.
 */
export const URGENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" + 시각("15:00"·"15시 00분"·"15:00:00") → KST 기준 epoch ms. 해석할 수 없으면 null. */
export function reservationStartMs(
    useDate: string,
    time: string,
): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(useDate)) return null;
    const hhmm = toHhmm(time ?? "");
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    const ms = Date.parse(`${useDate}T${m[1]}:${m[2]}:00+09:00`);
    return Number.isNaN(ms) ? null : ms;
}

/** 예약 희망 시각까지 24시간 미만인가. 입력이 덜 채워졌으면 false. */
export function isUrgentReservation(
    useDate: string,
    time: string,
    now: Date | number = new Date(),
): boolean {
    const start = reservationStartMs(useDate, time);
    if (start === null) return false;
    const nowMs = typeof now === "number" ? now : now.getTime();
    return start - nowMs < URGENT_THRESHOLD_MS;
}

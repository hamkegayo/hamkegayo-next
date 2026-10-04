/** 이용약관 제13조 ③④ — 매일 07:00~19:00, 주말·공휴일 포함. */
export const SERVICE_OPEN_HOUR = 7;
export const SERVICE_CLOSE_HOUR = 19;
export const SERVICE_SLOT_MINUTES = 30;
export const SERVICE_HOURS = `${String(SERVICE_OPEN_HOUR).padStart(2, "0")}:00~${String(SERVICE_CLOSE_HOUR).padStart(2, "0")}:00`;
export const SERVICE_HOURS_LABEL = `매일 ${SERVICE_HOURS} · 주말·공휴일 포함`;

/** 예약 선택지와 같은 30분 간격을 서버에서도 검증한다. */
export function isServiceTime(time: string): boolean {
    const match = /^(\d{1,2})(?::([0-5]\d)|시\s*([0-5]\d)분)$/.exec(
        time.trim(),
    );
    if (!match) return false;
    const minutes = Number(match[1]) * 60 + Number(match[2] ?? match[3]);
    return (
        minutes >= SERVICE_OPEN_HOUR * 60 &&
        minutes <= SERVICE_CLOSE_HOUR * 60 &&
        minutes % SERVICE_SLOT_MINUTES === 0
    );
}

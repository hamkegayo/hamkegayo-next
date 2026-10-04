/** 이용약관 제13조 ③④ — 매일 07:00~19:00, 주말·공휴일 포함. */
export const SERVICE_OPEN_HOUR = 7;
export const SERVICE_CLOSE_HOUR = 19;
export const SERVICE_SLOT_MINUTES = 30;
export const SERVICE_HOURS = `${String(SERVICE_OPEN_HOUR).padStart(2, "0")}:00~${String(SERVICE_CLOSE_HOUR).padStart(2, "0")}:00`;
export const SERVICE_HOURS_LABEL = `매일 ${SERVICE_HOURS} · 주말·공휴일 포함`;

/** 사용자 확정: 예상 종료까지 19시 이내, 최소 예약 2시간. */
export function isServiceBooking(
    time: string,
    durationMinutes: number,
): boolean {
    if (
        !isServiceTime(time) ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes < 120 ||
        durationMinutes > 240 ||
        durationMinutes % 30 !== 0
    )
        return false;
    const parts = /^(\d{1,2})(?::([0-5]\d)|시\s*([0-5]\d)분)$/.exec(
        time.trim(),
    )!;
    return (
        Number(parts[1]) * 60 +
            Number(parts[2] ?? parts[3]) +
            durationMinutes <=
        SERVICE_CLOSE_HOUR * 60
    );
}

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

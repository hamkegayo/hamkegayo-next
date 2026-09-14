import { kstDate } from "@/lib/format";

/** PG사 심사 기준: 결제일을 1일째로 계산해 60일 이내만 예약할 수 있다. */
export const ADVANCE_RESERVATION_DAYS = 60;

export const ADVANCE_RESERVATION_ERROR_CODE = "RESERVATION_DATE_OUT_OF_RANGE";

export const ADVANCE_RESERVATION_FIELD_MESSAGE =
    "이용 날짜는 오늘을 1일째로 계산해 60일 이내에서 선택해 주세요.";

export const ADVANCE_RESERVATION_PAYMENT_MESSAGE =
    "PG사 기준에 따라 결제일을 1일째로 계산해 60일 이내 날짜만 결제할 수 있습니다. 기존 예약을 취소하고 날짜를 다시 선택해 주세요.";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCalendarDate(value: string): Date | null {
    const match = ISO_DATE.exec(value);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
}

function formatCalendarDate(date: Date): string {
    const year = String(date.getUTCFullYear()).padStart(4, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function isCalendarDate(value: string): boolean {
    return parseCalendarDate(value) !== null;
}

export function addCalendarDays(value: string, days: number): string | null {
    const date = parseCalendarDate(value);
    if (!date || !Number.isInteger(days)) return null;

    date.setUTCDate(date.getUTCDate() + days);
    return formatCalendarDate(date);
}

/** 결제일을 1일째로 보므로 마지막 예약 가능일은 KST 결제일 + 59일이다. */
export function maxAdvanceReservationDate(now: Date = new Date()): string {
    const today = kstDate(now);
    const lastDate = today
        ? addCalendarDays(today, ADVANCE_RESERVATION_DAYS - 1)
        : null;

    if (!lastDate) throw new Error("예약 가능일을 계산할 수 없습니다.");
    return lastDate;
}

export function isBeyondAdvanceReservationWindow(
    useDate: string,
    now: Date = new Date(),
): boolean {
    if (!isCalendarDate(useDate)) return false;
    return useDate > maxAdvanceReservationDate(now);
}

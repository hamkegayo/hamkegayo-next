import { isCalendarDate } from "@/lib/reservation-window";

export const MIN_SERVICE_AGE = 19;

export const MIN_SERVICE_AGE_MESSAGE =
    "서비스 이용일 기준 만 19세 이상만 예약할 수 있습니다. 이용자 생년월일 또는 이용 날짜를 확인해 주세요.";

/**
 * 생년월일과 서비스 이용일을 달력 날짜로 비교해 만 나이를 판정한다.
 *
 * 시간대가 섞이지 않도록 Date 객체 대신 검증된 YYYY-MM-DD 구성요소를 비교한다.
 * 약관 제5조 ⑤ — 실제 서비스 이용자는 만 19세 이상이어야 한다.
 */
export function isAtLeastAgeOnDate(
    birthDate: string,
    useDate: string,
    minimumAge = MIN_SERVICE_AGE,
): boolean {
    if (
        !Number.isInteger(minimumAge) ||
        minimumAge < 0 ||
        !isCalendarDate(birthDate) ||
        !isCalendarDate(useDate)
    ) {
        return false;
    }

    const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
    const [useYear, useMonth, useDay] = useDate.split("-").map(Number);

    const age =
        useYear -
        birthYear -
        (useMonth < birthMonth || (useMonth === birthMonth && useDay < birthDay)
            ? 1
            : 0);

    return age >= minimumAge;
}

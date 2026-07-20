/**
 * 휴대폰번호 자동 하이픈 포맷.
 * 숫자만 추출해 최대 11자리로 자르고 3-4-4(휴대폰) 형태로 변환한다.
 *  예) "01012341234" → "010-1234-1234"
 */
export function formatPhoneNumber(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length < 4) return digits;
    if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

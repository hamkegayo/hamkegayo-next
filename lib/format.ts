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

/**
 * 카드 번호 자동 하이픈 포맷.
 * 숫자만 추출해 최대 16자리로 자르고 4자리마다 "-"를 넣는다.
 *  예) "1234123412341234" → "1234-1234-1234-1234"
 */
export function formatCardNumber(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}

/** 숫자만 남기고 최대 length 자리로 자름 (유효기간 MM/YY 입력용) */
export function digitsOnly(value: string, length: number): string {
    return value.replace(/\D/g, "").slice(0, length);
}

/**
 * 예약 시각 문자열 → "HH:mm".
 *
 * DB 의 arrive_time·reserve_time 은 예약 폼 옵션값이라 "15시 00분" 으로 저장되고,
 * 시드·수기 데이터에는 "15:00"/"15:00:00" 도 섞인다. 숫자 두 개(시/분)를 뽑아
 * 한 형태로 통일한다. 분이 없으면 00, 형식이 아니면 원본 그대로.
 *  예) "15시 00분" · "15:00:00" → "15:00"
 */
export function toHhmm(time: string): string {
    const m = /^(\d{1,2})(?:\D+(\d{1,2}))?/.exec(time.trim());
    if (!m) return time;
    return `${m[1].padStart(2, "0")}:${(m[2] ?? "0").padStart(2, "0")}`;
}

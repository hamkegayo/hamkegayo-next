/**
 * 서비스 기준 시간대.
 *
 *  ⚠️ **서버에서 `getHours()` · `getDate()` 를 쓰지 않는다.** 그 값은 실행
 *     환경의 시간대를 따르는데, Vercel 은 UTC 로 돈다. 개발 기계가 KST 라
 *     로컬에서는 맞아 보이고 프로덕션에서만 9시간 어긋난다.
 *
 *  이 파일의 kst* 함수는 시간대를 명시하므로 어디서 돌든 같은 값을 낸다.
 */
export const KST = "Asia/Seoul";

const KST_PARTS = new Intl.DateTimeFormat("en-US", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

type Parts = { y: string; mo: string; d: string; h: string; mi: string };

function parts(value: string | number | Date | null): Parts | null {
    if (value === null || value === "") return null;
    const at = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(at.getTime())) return null;

    const found: Record<string, string> = {};
    for (const p of KST_PARTS.formatToParts(at)) found[p.type] = p.value;
    // hour12:false 는 자정을 "24" 로 내는 구현이 있다.
    const h = found.hour === "24" ? "00" : found.hour;
    return {
        y: found.year,
        mo: found.month,
        d: found.day,
        h,
        mi: found.minute,
    };
}

/** ISO → "HH:mm" (KST). 값이 없거나 잘못된 형식이면 null. */
export function kstTime(value: string | number | Date | null): string | null {
    const p = parts(value);
    return p && `${p.h}:${p.mi}`;
}

/** ISO → "YYYY-MM-DD" (KST). 날짜 계산·쿼리 기준값에 쓴다. */
export function kstDate(value: string | number | Date | null): string | null {
    const p = parts(value);
    return p && `${p.y}-${p.mo}-${p.d}`;
}

/** ISO → "YYYY.MM.DD" (KST). 화면 표시용. */
export function kstDateDot(
    value: string | number | Date | null,
): string | null {
    const p = parts(value);
    return p && `${p.y}.${p.mo}.${p.d}`;
}

/** ISO → "YYYY.MM.DD HH:mm" (KST). 화면 표시용. */
export function kstDateTime(
    value: string | number | Date | null,
): string | null {
    const p = parts(value);
    return p && `${p.y}.${p.mo}.${p.d} ${p.h}:${p.mi}`;
}

/** ISO → "MM.DD HH:mm" (KST). 목록·타임라인처럼 연도가 필요 없는 자리. */
export function kstStamp(value: string | number | Date | null): string | null {
    const p = parts(value);
    return p && `${p.mo}.${p.d} ${p.h}:${p.mi}`;
}

/** 오늘 날짜 "YYYY-MM-DD" (KST). 만 나이·오늘 일정 판정의 기준. */
export function kstToday(): string {
    return kstDate(new Date())!;
}

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

/**
 * 고객센터 전화 연결 판정 (#304).
 *
 *  PC 웹에서 `tel:` 링크를 누르면 전화 앱이 없어 아무 일도 일어나지 않거나
 *  OS 의 "앱 선택" 창만 뜬다. 터치가 주 입력인 기기(휴대폰·태블릿)만 기본
 *  `tel:` 동작을 두고, 나머지는 번호·QR·카카오톡 안내 모달을 연다.
 */
import { COMPANY } from "@/lib/legal/company";

/**
 * 주 포인터가 터치인지.
 *
 *  `(pointer: coarse)` 는 **주** 입력 장치만 본다. Windows 터치 노트북은 주
 *  포인터가 마우스(`fine`)이고 `any-pointer: coarse` 만 참이라 PC 로 본다 —
 *  `any-pointer` 나 `navigator.maxTouchPoints` 단독으로 판별하면 이런 기기에서
 *  모달 대신 동작하지 않는 `tel:` 로 보내게 된다.
 *
 *  ⚠️ 렌더 중에 부르지 않는다(SSR 에서는 false 라 하이드레이션이 어긋난다).
 *     클릭 핸들러처럼 브라우저 이벤트 안에서만 부른다.
 */
export function isTouchPrimaryDevice(): boolean {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(pointer: coarse)").matches;
}

/** "HH:MM" → 자정 기준 분 */
function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.trim().split(":").map(Number);
    return h * 60 + m;
}

const KST_OFFSET_MINUTES = 9 * 60;

/**
 * 지금이 고객센터 상담 시간인지 (KST).
 *
 *  시각은 COMPANY.hours 한 곳에서 읽는다 — 약관 부칙·고객센터 화면과
 *  어긋나지 않게 여기에 다시 적지 않는다.
 */
// 약관 부칙 — 고객센터 운영시간 06:00-18:00 (서비스 제공시간 07:00-19:00, 약관 제13조 ③과 별개)
export function isWithinSupportHours(now: Date = new Date()): boolean {
    const [start, end] = COMPANY.hours.split("~");
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
    // 서버(UTC)·브라우저(어느 시간대든) 모두 같은 답을 내도록 UTC 에서 직접 환산한다.
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const kstMinutes = (utcMinutes + KST_OFFSET_MINUTES) % (24 * 60);
    return startMinutes <= kstMinutes && kstMinutes < endMinutes;
}

/** `tel:` 접두사를 보장한다 */
export function normalizeTelHref(tel: string): string {
    return tel.startsWith("tel:") ? tel : `tel:${tel}`;
}

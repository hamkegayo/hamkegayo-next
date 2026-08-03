/**
 * 애널리틱스 동의(consent) 저장/조회 — localStorage 기반의 순수 함수 모음.
 * React 훅(hooks/use-consent.ts)과 track 헬퍼(lib/analytics.ts)가 함께 참조한다.
 */
export type ConsentValue = "granted" | "denied";

export const CONSENT_STORAGE_KEY = "hamkegayo:analytics-consent";

/** 저장된 동의값 (미선택이면 null) */
export function readConsent(): ConsentValue | null {
    if (typeof window === "undefined") return null;
    try {
        const v = localStorage.getItem(CONSENT_STORAGE_KEY);
        return v === "granted" || v === "denied" ? v : null;
    } catch {
        return null;
    }
}

export function writeConsent(value: ConsentValue): void {
    try {
        localStorage.setItem(CONSENT_STORAGE_KEY, value);
    } catch {
        // localStorage 접근 불가(프라이빗 모드 등) 시 무시
    }
}

/** 추적 전송 전 게이트로 쓰는 동의 여부 */
export function isConsentGranted(): boolean {
    return readConsent() === "granted";
}

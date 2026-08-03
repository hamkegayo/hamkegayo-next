/**
 * GA4 + Meta Pixel 이벤트 전송 헬퍼.
 *
 * 원칙:
 *  - 모든 전송은 동의(consent) 게이트를 통과해야 한다. 스크립트 로딩 단계에서 한 번,
 *    여기 track 단계에서 한 번 더 확인해 "세션 중 철회" 같은 경우도 막는다.
 *  - 개인정보(이름·이메일·전화·주소·병원명·환자/보호자 정보·예약 상세·리포트)는
 *    파라미터로 절대 전송하지 않는다.
 *  - 결제 연동 전이므로 Purchase 이벤트는 보내지 않는다.
 */
import { isConsentGranted } from "@/lib/consent";

declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
        fbq?: (...args: unknown[]) => void;
    }
}

type Params = Record<string, string | number | boolean>;

/** 동의 + 클라이언트 환경 확인 (전송 전 항상 통과해야 함) */
function canTrack(): boolean {
    return typeof window !== "undefined" && isConsentGranted();
}

export function gaEvent(name: string, params?: Params): void {
    if (!canTrack() || typeof window.gtag !== "function") return;
    window.gtag("event", name, params ?? {});
}

export function fbEvent(name: string, params?: Params, custom = false): void {
    if (!canTrack() || typeof window.fbq !== "function") return;
    window.fbq(custom ? "trackCustom" : "track", name, params ?? {});
}

/** 페이지뷰 — 라우트 변경 시 수동 전송 (경로 외 식별정보 없음) */
export function trackPageView(path: string): void {
    if (!canTrack()) return;
    if (typeof window.gtag === "function") {
        window.gtag("event", "page_view", {
            page_path: path,
            page_location: window.location.href,
            page_title: document.title,
        });
    }
    if (typeof window.fbq === "function") window.fbq("track", "PageView");
}

/* ---------- 표준 전환 이벤트 (GA4 / Meta Pixel) ---------- */

/** 회원가입 완료 */
export function trackSignUp(): void {
    gaEvent("sign_up");
    fbEvent("CompleteRegistration");
}

/** 예약 시작 (예약 플로우 진입) */
export function trackReservationStart(): void {
    gaEvent("begin_checkout");
    fbEvent("InitiateCheckout");
}

/** 예약 신청 완료 (MATCHING 예약 생성 성공) — 결제 전이므로 Purchase 아님 */
export function trackReservationSubmit(): void {
    gaEvent("generate_lead");
    fbEvent("Schedule");
}

/** 문의 버튼 클릭 (전화 상담 / 고객센터) */
export function trackContact(method?: "phone" | "support"): void {
    gaEvent("contact", method ? { method } : undefined);
    fbEvent("Contact");
}

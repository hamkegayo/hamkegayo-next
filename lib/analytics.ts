/**
 * GA4 + Meta Pixel 이벤트 전송 헬퍼.
 *
 * 원칙:
 *  - 모든 전송은 동의(consent) 게이트를 통과해야 한다. 스크립트 로딩 단계에서 한 번,
 *    여기 track 단계에서 한 번 더 확인해 "세션 중 철회" 같은 경우도 막는다.
 *  - 개인정보(이름·이메일·전화·주소·병원명·환자/보호자 정보·생년월일·성별·진료 내용·
 *    예약 상세·리포트·결제/카드 정보)는 파라미터로 절대 전송하지 않는다.
 *    (고급 매칭은 개인정보처리방침 정비 후 별도 도입 예정 — 현재 미적용)
 *  - 결제가 완결되는 지점이 없으므로 Purchase 이벤트는 보내지 않는다.
 *  - 기존 GA4 호출은 유지하고, 같은 지점에 Meta Pixel 호출을 나란히 둔다.
 */
import { PLAN_INFO, type PlanCode } from "@/lib/reservation";
import { isConsentGranted } from "@/lib/consent";

declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
        fbq?: (...args: unknown[]) => void;
    }
}

type GaParams = Record<string, string | number | boolean>;
type PixelParams = Record<string, unknown>;

const IS_DEV = process.env.NODE_ENV !== "production";
const DEBUG = process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";

/** 동의 + 클라이언트 환경 확인 (전송 전 항상 통과해야 함) */
function canTrack(): boolean {
    return typeof window !== "undefined" && isConsentGranted();
}

/** Conversions API 중복 제거용 고유 이벤트 ID */
function eventId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ---------- 로우레벨 전송 ---------- */

export function gaEvent(name: string, params?: GaParams): void {
    if (!canTrack() || typeof window.gtag !== "function") return;
    window.gtag("event", name, params ?? {});
}

/**
 * Meta Pixel 표준 이벤트 전송.
 *  - 고유 eventID 를 함께 보내 서버(Conversions API)와의 중복 집계를 막는다.
 *  - 개발 환경에서는 콘솔 로그로도 확인할 수 있게 남긴다(실제 발송은 스크립트가 로드된
 *    경우에만 — dev 는 NEXT_PUBLIC_ANALYTICS_DEBUG=true 일 때만 로드).
 */
function pixel(name: string, params?: PixelParams): void {
    const options = { eventID: eventId() };
    if (IS_DEV || DEBUG) {
        console.log("[pixel]", name, params ?? {}, options);
    }
    if (!canTrack() || typeof window.fbq !== "function") return;
    window.fbq("track", name, params ?? {}, options);
}

/* ---------- 공통: 페이지뷰 ---------- */

/** 라우트 변경 시 수동 page_view (경로 외 식별정보 없음) */
export function trackPageView(path: string): void {
    if (canTrack() && typeof window.gtag === "function") {
        window.gtag("event", "page_view", {
            page_path: path,
            page_location: window.location.href,
            page_title: document.title,
        });
    }
    pixel("PageView");
}

/* ---------- 퍼널/전환 이벤트 ---------- */

/** 회원가입 완료 */
export function trackSignUp(): void {
    gaEvent("sign_up");
    pixel("CompleteRegistration");
}

/** 예약 진입 시 GA begin_checkout (Pixel InitiateCheckout 은 인트로 확인에서 별도) */
export function trackBeginCheckoutGA(): void {
    gaEvent("begin_checkout");
}

/** "예약 시작하기"(인트로 확인) 클릭 — Pixel InitiateCheckout */
export function trackInitiateCheckout(): void {
    pixel("InitiateCheckout", { num_items: 1 });
}

/** 서비스 소개(/service) 조회 — Pixel ViewContent */
export function trackServiceView(): void {
    pixel("ViewContent", {
        content_name: "서비스 소개",
        content_type: "product",
    });
}

/** 플랜(베이직/플러스) 선택 — Pixel AddToCart (금액은 상품 데이터에서) */
export function trackAddToCart(plan: PlanCode): void {
    const info = PLAN_INFO[plan];
    pixel("AddToCart", {
        content_name: info.label,
        content_ids: [plan],
        contents: [{ id: plan, quantity: 1, item_price: info.price }],
        value: info.price,
        currency: "KRW",
    });
}

/**
 * 예약 신청 완료 (서버가 성공 응답을 반환한 직후 콜백에서 호출).
 * GA generate_lead 유지 + Pixel Schedule/Lead.
 * 단순 신청 접수이므로 Purchase 는 사용하지 않는다.
 *
 * @param amount 선결제 예상액(원). 없으면 시간당 기본요금으로 갈음한다.
 */
export function trackReservationComplete(
    plan: PlanCode,
    amount?: number,
): void {
    gaEvent("generate_lead");
    const info = PLAN_INFO[plan];
    const params: PixelParams = {
        content_name: info.label,
        content_ids: [plan],
        value: amount ?? info.price,
        currency: "KRW",
    };
    pixel("Schedule", params);
    pixel("Lead", params);
}

/** 문의 버튼 클릭 (전화 상담 / 고객센터) */
export function trackContact(method?: "phone" | "support"): void {
    gaEvent("contact", method ? { method } : undefined);
    pixel("Contact");
}

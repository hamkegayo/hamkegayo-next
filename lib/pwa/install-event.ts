/**
 * `beforeinstallprompt` 캡처 (#117).
 *
 *  ## 왜 인라인 스크립트인가
 *
 *  이 이벤트는 문서당 **한 번** 온다. 그리고 매니페스트를 받은 직후라
 *  느린 폰에서는 **React 가 hydrate 되기 전에** 올 수 있다. 컴포넌트의
 *  useEffect 에서 리스너를 달면 그 경우를 놓치고, 놓치면 그 방문에서는
 *  설치 버튼이 아무 일도 하지 않는다.
 *
 *  그래서 `CAPTURE_SCRIPT` 를 root layout 에서 `beforeInteractive` 로 심어
 *  이벤트를 `window.__hamkegayoBip` 에 붙잡아 두고, 컴포넌트는 나중에
 *  `useSyncExternalStore` 로 읽는다.
 *
 *  ## preventDefault 의 의미
 *
 *  Chrome 이 스스로 띄우는 설치 배너(mini-infobar)를 막는다. 설치를 권하는
 *  시점은 우리가 정한다 — `/login`·`/signup` 에서만(#117). Chrome 메뉴의
 *  "앱 설치" 는 그대로 남는다.
 *
 *  이 파일은 서버에서도 import 된다(layout 이 스크립트 문자열을 쓴다).
 *  window 는 함수 안에서만 만진다.
 */

export interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    readonly userChoice: Promise<{
        outcome: "accepted" | "dismissed";
        platform: string;
    }>;
}

declare global {
    interface Window {
        __hamkegayoBip?: BeforeInstallPromptEvent | null;
    }
}

/** 붙잡은 이벤트가 바뀌었음을 알리는 사용자 정의 이벤트 */
const CHANGE_EVENT = "hamkegayo:bip";

/** hydration 전에 실행된다 — root layout 의 beforeInteractive 스크립트 본문 */
export const CAPTURE_SCRIPT = `(function(){
window.__hamkegayoBip=null;
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__hamkegayoBip=e;window.dispatchEvent(new Event("${CHANGE_EVENT}"));});
window.addEventListener("appinstalled",function(){window.__hamkegayoBip=null;window.dispatchEvent(new Event("${CHANGE_EVENT}"));});
})();`;

export function subscribeInstallEvent(onChange: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

export function getInstallEvent(): BeforeInstallPromptEvent | null {
    return window.__hamkegayoBip ?? null;
}

export function getServerInstallEvent(): null {
    return null;
}

/**
 * 붙잡은 이벤트를 비운다. `prompt()` 는 **한 번만** 쓸 수 있어서, 호출하는
 * 순간 비워야 같은 이벤트로 두 번 부르지 않는다.
 */
export function clearInstallEvent(): void {
    window.__hamkegayoBip = null;
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

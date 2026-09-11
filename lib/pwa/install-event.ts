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
        /** 설치 흐름 기록 [시각, 내용] — 실기기 진단용 (components/pwa/pwa-debug.tsx) */
        __hamkegayoPwaLog?: [number, string][];
    }
}

/** 붙잡은 이벤트가 바뀌었음을 알리는 사용자 정의 이벤트 */
const CHANGE_EVENT = "hamkegayo:bip";
/** 설치 흐름 기록이 늘었음을 알리는 사용자 정의 이벤트 */
export const LOG_EVENT = "hamkegayo:pwa-log";
/** 콘솔 출력 접두사 — 필터 칸에 이것만 치면 설치 흐름만 남는다 */
const CONSOLE_TAG = "[pwa]";

/** hydration 전에 실행된다 — root layout 의 beforeInteractive 스크립트 본문 */
export const CAPTURE_SCRIPT = `(function(){
function L(m){(window.__hamkegayoPwaLog=window.__hamkegayoPwaLog||[]).push([Date.now(),m]);try{console.debug("${CONSOLE_TAG}",m);}catch(_){}window.dispatchEvent(new Event("${LOG_EVENT}"));}
window.__hamkegayoBip=null;
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__hamkegayoBip=e;L("beforeinstallprompt 수신 (platforms: "+(e.platforms||[]).join(",")+")");window.dispatchEvent(new Event("${CHANGE_EVENT}"));});
window.addEventListener("appinstalled",function(){window.__hamkegayoBip=null;L("appinstalled 수신");window.dispatchEvent(new Event("${CHANGE_EVENT}"));});
})();`;

/**
 * 설치 흐름을 기록한다. 항상 남긴다(몇 줄뿐이다).
 *
 *  실기기에서 "눌렀는데 아무 일도 없다" 는 원격으로 재현되지 않는다
 *  (#117 스테이징 검증). 기기·환경마다 원인이 다르므로 **사유를 볼 수 있어야
 *  한다**(#141 리뷰). 두 곳으로 내보낸다.
 *
 *  | 출구                   | 보는 법                                        |
 *  | ---------------------- | ---------------------------------------------- |
 *  | 화면 (pwa-debug.tsx)   | `?pwa-debug=1` — 폰에서 바로, 사용자에게도 요청 가능 |
 *  | 콘솔 `console.debug`   | 원격 디버깅(chrome://inspect) · 필터 `[pwa]`   |
 *
 *  `console.debug` 인 이유 — 모든 사용자에게 항상 남는 기록이다. DevTools 는
 *  debug 를 기본 숨김(Verbose)으로 두므로 평소 콘솔을 어지럽히지 않고, 볼
 *  사람은 레벨만 켜면 된다.
 *
 *  ⚠️ 개인정보를 넣지 않는다. 지금 남기는 것은 이벤트 이름·결과·브라우저
 *     오류 문구뿐이다(클라이언트 흐름). 계정·예약 정보를 여기에 붙이지 않는다.
 */
export function pwaLog(message: string): void {
    if (typeof window === "undefined") return;
    (window.__hamkegayoPwaLog ??= []).push([Date.now(), message]);
    console.debug(CONSOLE_TAG, message);
    window.dispatchEvent(new Event(LOG_EVENT));
}

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

export function subscribePwaLog(onChange: () => void): () => void {
    window.addEventListener(LOG_EVENT, onChange);
    return () => window.removeEventListener(LOG_EVENT, onChange);
}

/** 기록 줄 수 — 스냅숏은 원시값이어야 useSyncExternalStore 가 안정적이다 */
export function getPwaLogSize(): number {
    return window.__hamkegayoPwaLog?.length ?? 0;
}

export function getServerPwaLogSize(): number {
    return 0;
}

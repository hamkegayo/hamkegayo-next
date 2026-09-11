/**
 * PWA 설치 유도 — 플랫폼 판정 (#117).
 *
 *  설치 경로가 환경마다 전혀 다르다. 4갈래로 나눈다.
 *
 *  | 환경           | 처리                                                     |
 *  | -------------- | -------------------------------------------------------- |
 *  | Android        | `beforeinstallprompt` 를 **잡은 뒤에만** 모달 → prompt()  |
 *  | iOS            | 이벤트가 없다 → 공유 → "홈 화면에 추가" 안내              |
 *  | 이미 설치됨    | 무조건 스킵                                              |
 *  | 인앱 브라우저  | 설치 불가 → 외부 브라우저로 보낸다                        |
 *
 *  ## 인앱 브라우저 — 버튼 하나로 되는 건 일부뿐이다
 *
 *  Meta Pixel 로 광고를 돌리고 있어 인스타·페북 인앱 유입이 가장 많이 걸릴
 *  조합인데, **그 조합이 강제 이동이 불가능한 쪽**이다.
 *
 *  | 인앱                 | 가능한 것                          |
 *  | -------------------- | ---------------------------------- |
 *  | 안드로이드 전반      | intent:// → Chrome 직행            |
 *  | 카카오톡 (iOS)       | kakaotalk://web/openExternal       |
 *  | 그 밖의 iOS 인앱     | 방법 없음 → ⋯ 메뉴 안내 + 주소 복사 |
 *
 *  UA 판정은 순수 함수다 — 브라우저 전역을 읽지 않는다. 호출부가 넘긴다.
 */

export type Platform =
    | { kind: "standalone" }
    | { kind: "desktop" }
    | { kind: "android" }
    | { kind: "ios"; browser: "safari" | "other" }
    | { kind: "inapp-android"; app: InAppName }
    | { kind: "inapp-kakao-ios" }
    | { kind: "inapp-ios"; app: InAppName };

export type InAppName =
    | "kakaotalk"
    | "instagram"
    | "facebook"
    | "naver"
    | "line"
    | "daum"
    | "webview";

/** 알려진 인앱 브라우저 표식. 순서대로 본다. */
const IN_APP_MARKERS: [RegExp, InAppName][] = [
    [/KAKAOTALK/i, "kakaotalk"],
    [/Instagram/, "instagram"],
    [/FBAN|FBAV|FB_IAB/, "facebook"],
    [/NAVER\(inapp/, "naver"],
    [/\bLine\//, "line"],
    [/DaumApps/, "daum"],
];

export type PlatformInput = {
    userAgent: string;
    /** display-mode: standalone 이거나 navigator.standalone */
    standalone: boolean;
    /** iPadOS 판별용 — 데스크톱 UA 를 쓰지만 터치가 있다 */
    maxTouchPoints: number;
};

export function detectPlatform({
    userAgent: ua,
    standalone,
    maxTouchPoints,
}: PlatformInput): Platform {
    if (standalone) return { kind: "standalone" };

    // iPadOS 13+ 는 기본이 "데스크톱 웹사이트 요청" 이라 Mac UA 를 쓴다.
    const isIOS =
        /iPhone|iPad|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);

    if (!isIOS && !isAndroid) return { kind: "desktop" };

    for (const [re, app] of IN_APP_MARKERS) {
        if (!re.test(ua)) continue;
        if (!isIOS) return { kind: "inapp-android", app };
        return app === "kakaotalk"
            ? { kind: "inapp-kakao-ios" }
            : { kind: "inapp-ios", app };
    }

    // 표식이 없는 인앱도 있다.
    //  · 안드로이드 WebView 는 UA 에 "; wv)" 를 넣는다
    //  · iOS 인앱(WKWebView)은 "Safari/" 토큰이 없다 — Safari·Chrome·Firefox
    //    iOS 는 모두 넣는다
    if (isAndroid && /; wv\)/.test(ua)) {
        return { kind: "inapp-android", app: "webview" };
    }
    if (isIOS && !/Safari\//.test(ua)) {
        return { kind: "inapp-ios", app: "webview" };
    }

    if (isAndroid) return { kind: "android" };

    return {
        kind: "ios",
        browser: /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "other" : "safari",
    };
}

/**
 * 안드로이드 인앱 → Chrome 으로 여는 intent 주소.
 *
 *  `package` 를 지정한다. 빼면 인앱 WebView 가 스스로 받아 제자리에서 연다.
 */
export function chromeIntentUrl(href: string): string {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
}

/** 카카오톡 iOS 인앱 → Safari 로 여는 주소 */
export function kakaoExternalUrl(href: string): string {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
}

/** 계측용 한 단어 이름 */
export function platformLabel(p: Platform): string {
    switch (p.kind) {
        case "ios":
            return `ios-${p.browser}`;
        case "inapp-android":
        case "inapp-ios":
            return `${p.kind}-${p.app}`;
        default:
            return p.kind;
    }
}

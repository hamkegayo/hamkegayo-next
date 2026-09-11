// PWA 설치 유도 — 재노출 정책 · 플랫폼 판정 단위 테스트 (#117).
//
// 실행 (Node 22.6+, DB 불필요):
//   npm run test:pwa
//
// ── 무엇을 지키려는 테스트인가 ────────────────────────────────
//
//  이 모달은 **"UX 를 방해하지 않는 것" 이 절반**이다. 깨지는 방식이 둘이다.
//
//   · 정책이 틀리면 — 닫아도 다음 날 또 뜬다. 고령 사용자에게는 서비스가
//     "자꾸 뭘 하라고 하는" 곳이 된다. 화면은 멀쩡해서 아무도 모른다
//   · 판정이 틀리면 — 인앱 브라우저에 "설치하기" 가 뜨고 눌러도 아무 일도
//     일어나지 않는다. 광고 유입(인스타·페북 인앱)이 정확히 그 조합이다
//
//  둘 다 실기기 없이는 안 보인다. 그래서 날짜와 UA 를 고정해 여기서 본다.

import {
    INITIAL_STATE,
    MAX_DISMISSALS,
    STORAGE_KEY,
    afterDismiss,
    afterInstall,
    isEligible,
    loadState,
    parseState,
    saveState,
} from "@/lib/pwa/prompt-policy";
import {
    chromeIntentUrl,
    detectPlatform,
    kakaoExternalUrl,
    platformLabel,
} from "@/lib/pwa/platform";

let passed = 0;
let failed = 0;
function check(name, ok, extra = "") {
    if (ok) {
        passed++;
        console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    } else {
        failed++;
        console.log(
            `  \x1b[31mFAIL\x1b[0m  ${name}${extra ? ` — ${extra}` : ""}`,
        );
    }
}

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 11, 3, 0, 0); // 임의의 기준 시각
const MIN = 60_000;

// ─────────────────────────────────────────────────────────────
console.log("\n[1] 재노출 정책 — 14일 → 60일 → 영구");

check("처음에는 띄운다", isEligible(INITIAL_STATE, T0));

const once = afterDismiss(INITIAL_STATE, T0);
check(
    "1회 닫음 → 14일 직전에는 안 띄운다",
    !isEligible(once, T0 + 14 * DAY - MIN),
);
check("1회 닫음 → 14일째에 띄운다", isEligible(once, T0 + 14 * DAY));

const twice = afterDismiss(once, T0 + 14 * DAY);
check(
    "2회 닫음 → 60일 직전에는 안 띄운다",
    !isEligible(twice, T0 + 14 * DAY + 60 * DAY - MIN),
);
check(
    "2회 닫음 → 60일째에 띄운다",
    isEligible(twice, T0 + 14 * DAY + 60 * DAY),
);

const thrice = afterDismiss(twice, T0 + 74 * DAY);
check(
    `${MAX_DISMISSALS}회 닫음 → 10년 뒤에도 안 띄운다`,
    !isEligible(thrice, T0 + 3650 * DAY),
);

check(
    "설치하면 영구 중단 (닫은 적 없어도)",
    !isEligible(afterInstall(INITIAL_STATE), T0),
);
check(
    "닫기는 횟수와 시각을 남긴다",
    once.count === 1 && once.dismissedAt === T0,
);

// ─────────────────────────────────────────────────────────────
console.log("\n[2] 저장 형식 — 깨진 값은 처음부터");

check("값 없음 → 처음 상태", parseState(null).count === 0);
check("JSON 아님 → 처음 상태", parseState("{oops").count === 0);
check(
    "음수 횟수 → 0 으로",
    parseState('{"count":-3,"dismissedAt":1}').count === 0,
);
check(
    "소수 횟수 → 내림",
    parseState('{"count":1.9,"dismissedAt":1}').count === 1,
);
check(
    "왕복해도 같다",
    JSON.stringify(parseState(JSON.stringify(twice))) ===
        JSON.stringify({ ...twice, installed: false }),
);

// ─────────────────────────────────────────────────────────────
console.log("\n[3] 저장소를 못 쓰면 띄우지 않는다");

const throwing = {
    getItem() {
        throw new Error("SecurityError");
    },
    setItem() {
        throw new Error("QuotaExceededError");
    },
};
check("읽기가 throw → null (안 띄움)", loadState(throwing) === null);
check("저장소 자체가 없음 → null", loadState(null) === null);
check("쓰기가 throw → false", saveState(throwing, once) === false);

const mem = new Map();
const memory = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
};
check(
    "정상 저장소 → 저장 후 그대로 읽힌다",
    saveState(memory, twice) && loadState(memory)?.count === 2,
);
check(`키는 ${STORAGE_KEY}`, mem.has("hamkegayo:pwa-prompt"));

// ─────────────────────────────────────────────────────────────
console.log("\n[4] 플랫폼 판정 — 실제 UA");

const UA = {
    androidChrome:
        "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
    samsung:
        "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
    iphoneSafari:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    iphoneChrome:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
    ipadDesktop:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    windowsChrome:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    kakaoIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0",
    kakaoAndroid:
        "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36;KAKAOTALK 2410900",
    instaIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.0.0 (iPhone15,2; iOS 17_5; ko_KR; ko; scale=3.00; 1179x2556; 634367146)",
    fbIOS: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/476.0.0.40.109;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBLC/ko_KR]",
    instaAndroid:
        "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Instagram 345.0.0.34.101 Android",
    naverIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.8.0; 15)",
    androidWebView:
        "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36",
    iosUnknownWebView:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

const at = (ua, extra = {}) =>
    platformLabel(
        detectPlatform({
            userAgent: ua,
            standalone: false,
            maxTouchPoints: 0,
            ...extra,
        }),
    );

const cases = [
    ["Android Chrome", at(UA.androidChrome), "android"],
    ["삼성 인터넷", at(UA.samsung), "android"],
    ["iPhone Safari", at(UA.iphoneSafari, { maxTouchPoints: 5 }), "ios-safari"],
    ["iPhone Chrome", at(UA.iphoneChrome, { maxTouchPoints: 5 }), "ios-other"],
    [
        "iPad (데스크톱 UA + 터치)",
        at(UA.ipadDesktop, { maxTouchPoints: 5 }),
        "ios-safari",
    ],
    ["Mac Safari (터치 없음)", at(UA.ipadDesktop), "desktop"],
    ["Windows Chrome", at(UA.windowsChrome), "desktop"],
    ["카카오톡 iOS", at(UA.kakaoIOS, { maxTouchPoints: 5 }), "inapp-kakao-ios"],
    ["카카오톡 Android", at(UA.kakaoAndroid), "inapp-android-kakaotalk"],
    [
        "인스타 iOS",
        at(UA.instaIOS, { maxTouchPoints: 5 }),
        "inapp-ios-instagram",
    ],
    ["페이스북 iOS", at(UA.fbIOS, { maxTouchPoints: 5 }), "inapp-ios-facebook"],
    ["인스타 Android", at(UA.instaAndroid), "inapp-android-instagram"],
    ["네이버 iOS", at(UA.naverIOS, { maxTouchPoints: 5 }), "inapp-ios-naver"],
    [
        "표식 없는 Android WebView",
        at(UA.androidWebView),
        "inapp-android-webview",
    ],
    [
        "표식 없는 iOS WebView",
        at(UA.iosUnknownWebView, { maxTouchPoints: 5 }),
        "inapp-ios-webview",
    ],
    [
        "설치된 앱(standalone)은 무엇이든 스킵",
        at(UA.instaIOS, { standalone: true }),
        "standalone",
    ],
];
for (const [name, got, want] of cases) {
    check(`${name} → ${want}`, got === want, `실제 ${got}`);
}

// ─────────────────────────────────────────────────────────────
console.log("\n[5] 외부 브라우저 딥링크");

const href = "https://www.hamkegayo.kr/login?next=%2Fmypage";
check(
    "Chrome intent — 경로·쿼리 보존, package 지정",
    chromeIntentUrl(href) ===
        "intent://www.hamkegayo.kr/login?next=%2Fmypage#Intent;scheme=https;package=com.android.chrome;end",
    chromeIntentUrl(href),
);
check(
    "카카오 openExternal — 주소 전체를 인코딩",
    kakaoExternalUrl(href) ===
        "kakaotalk://web/openExternal?url=https%3A%2F%2Fwww.hamkegayo.kr%2Flogin%3Fnext%3D%252Fmypage",
    kakaoExternalUrl(href),
);

console.log(
    `\n${failed === 0 ? "🎉" : "⚠️"}  ${passed}건 통과 / ${failed}건 실패`,
);
process.exit(failed === 0 ? 0 : 1);

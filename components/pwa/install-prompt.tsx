"use client";

/**
 * 모바일 PWA 설치 유도 모달 (#117).
 *
 *  **UX 를 방해하지 않는 것이 이 모달의 절반이다.** 그래서 띄우는 조건이
 *  보여 주는 내용보다 길다.
 *
 *  ## 언제 — 로그인·회원가입 화면에서만
 *
 *  로그인하려는 사람은 재방문 의사가 있는 사람이다. middleware 가 로그인
 *  상태의 /login·/signup 접근을 홈으로 돌려보내므로 **여기 도달하는 건
 *  비로그인 사용자뿐**이고, /login 은 이용자·파트너를 한 화면에서 받는다.
 *
 *  `ALLOWED_PATHS` 는 허용 목록이다. 결제 화면(/pay/*, 예약 결제 단계)과
 *  관리자 로그인은 목록에 없으므로 이 컴포넌트를 어디에 잘못 두어도 뜨지
 *  않는다 — 돈이 흐르는 화면의 모달은 이탈로 직결된다.
 *
 *  ## 띄우지 않는 경우
 *
 *  - 쿠키 동의 배너가 떠 있는 동안 — 배너(z-60)가 모달 딤 위에 겹친다.
 *    배너를 처리하면 **곧바로** 뜬다.
 *
 *    ⚠️ 사이에 딜레이(1.5초)를 둔 적이 있다(#137 리뷰). 실제로 써 보니
 *       사용자가 이미 로그인 폼으로 넘어간 뒤에 모달이 튀어나와 **뜬금없게**
 *       느껴졌다. 배너를 닫는 동작의 연장선에서 바로 뜨는 쪽이 자연스럽다.
 *       전환은 패널의 짧은 페이드 인으로만 부드럽게 한다
 *  - 재노출 정책이 막을 때 (lib/pwa/prompt-policy.ts)
 *  - 저장소를 못 쓸 때 — 닫아도 기록이 안 남아 매번 뜬다
 *  - 데스크톱 · 이미 설치된 앱
 *  - Android 에서 `beforeinstallprompt` 를 아직 못 잡았을 때 — 이벤트 없이
 *    띄우면 "설치하기" 가 아무 일도 하지 않는다
 *
 *  ## 계측
 *
 *  `gaEvent()` 는 쿠키 동의 게이트를 탄다. **동의하지 않은 사용자는 집계되지
 *  않는다** — 수치를 읽을 때 감안한다.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { useConsent } from "@/hooks/use-consent";
import { gaEvent } from "@/lib/analytics";
import {
    getInstallEvent,
    getServerInstallEvent,
    subscribeInstallEvent,
} from "@/lib/pwa/install-event";
import { platformLabel } from "@/lib/pwa/platform";
import {
    getPromptEnv,
    getServerPromptEnv,
    openInstallSheet,
    recordDismiss,
    subscribePromptEnv,
} from "./install-prompt-store";
import { canOffer, InstallSheet, type InstallHandlers } from "./install-sheet";

/** 이 경로에서만 띄운다 — 허용 목록 */
const ALLOWED_PATHS = ["/login", "/signup"];

export function InstallPrompt() {
    const pathname = usePathname();
    const { bannerOpen } = useConsent();
    const env = useSyncExternalStore(
        subscribePromptEnv,
        getPromptEnv,
        getServerPromptEnv,
    );
    const deferred = useSyncExternalStore(
        subscribeInstallEvent,
        getInstallEvent,
        getServerInstallEvent,
    );

    const allowed = ALLOWED_PATHS.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    const open =
        env !== null &&
        allowed &&
        !bannerOpen &&
        env.eligible &&
        canOffer(env.platform, deferred);

    const label = env ? platformLabel(env.platform) : "";

    // 계측 — 열린 순간 한 번
    const shownRef = useRef(false);
    useEffect(() => {
        if (!open || shownRef.current) return;
        shownRef.current = true;
        gaEvent("pwa_prompt_shown", { platform: label, source: "auto" });
    }, [open, label]);

    // 자동 모달은 닫기를 센다 — 재노출 정책(14일 → 60일 → 영구)의 입력이다
    const handlers: InstallHandlers = {
        dismiss: (via) => {
            const count = recordDismiss();
            gaEvent("pwa_prompt_dismissed", {
                platform: label,
                source: "auto",
                count,
                ...(via ? { via } : {}),
            });
        },
        accept: (via) => {
            gaEvent("pwa_prompt_accepted", {
                platform: label,
                source: "auto",
                via,
            });
            // 인앱 → 외부 브라우저 이동은 닫기로 센다(#137 리뷰). 외부 브라우저는
            // 저장소가 따로라 거기서 처음부터 판정하고, 인앱으로 돌아왔을 때는
            // 같은 안내를 또 보지 않는다.
            if (via === "external") recordDismiss();
        },
        // 설치창을 못 열었다 — 사용자가 거절한 게 아니므로 세지 않는다.
        // 모달은 이미 닫혔으니 root layout 호스트가 Chrome 메뉴 안내를 띄운다.
        fail: () => {
            gaEvent("pwa_prompt_failed", { platform: label, source: "auto" });
            openInstallSheet("android-menu", "auto");
        },
    };

    if (!env) return null;

    return (
        <InstallSheet
            open={open}
            platform={env.platform}
            deferred={deferred}
            handlers={handlers}
        />
    );
}

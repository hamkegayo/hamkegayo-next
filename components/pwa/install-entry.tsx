"use client";

/**
 * 상시 "앱 설치" 진입점 (#139).
 *
 *  모바일에서 설치하려면 브라우저 ⋮ 메뉴를 찾아 들어가야 했다. 이 번거로움은
 *  #117 이 키웠다 — 설치 모달의 시점을 정하려고 Chrome 자체 설치 배너를 모든
 *  화면에서 막았고(`preventDefault`), 그래서 /login·/signup 밖에서는 ⋮ 메뉴가
 *  유일한 경로가 됐다. 로그인한 사용자는 로그인 화면에 다시 오지 않는다.
 *
 *  | 환경                  | 버튼 | 누르면                                 |
 *  | --------------------- | ---- | -------------------------------------- |
 *  | Android (이벤트 잡음) | 보임 | **곧바로 네이티브 설치창** — 중간 없음 |
 *  | Android (이벤트 없음) | 숨김 | 이미 설치됐거나 조건 미충족            |
 *  | iOS · 인앱 브라우저   | 보임 | 안내 시트 (install-sheet.tsx)          |
 *  | 데스크톱 · 설치된 앱  | 숨김 |                                        |
 *
 *  **닫기 횟수를 세지 않는다.** 사용자가 직접 누른 것이다 — 재노출 정책은
 *  우리가 먼저 권하는 자동 모달(install-prompt.tsx)에만 걸린다.
 *  계측은 `source: "menu"` 로 자동 모달과 구분한다.
 */

import { useEffect, useSyncExternalStore } from "react";
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";
import { gaEvent } from "@/lib/analytics";
import {
    getInstallEvent,
    getServerInstallEvent,
    subscribeInstallEvent,
} from "@/lib/pwa/install-event";
import { platformLabel } from "@/lib/pwa/platform";
import {
    getInstallSheet,
    getPromptEnv,
    getServerInstallSheet,
    getServerPromptEnv,
    closeInstallSheet,
    openInstallSheet,
    subscribeInstallSheet,
    type SheetState,
    subscribePromptEnv,
} from "./install-prompt-store";
import {
    canOffer,
    InstallSheet,
    runNativePrompt,
    type InstallHandlers,
} from "./install-sheet";

function useInstallInputs() {
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
    return { env, deferred };
}

/** 호스트 시트의 동작 — 닫아도 세지 않는다 */
function sheetHandlers(
    label: string,
    source: SheetState["source"],
): InstallHandlers {
    return {
        dismiss: (via) => {
            closeInstallSheet();
            gaEvent("pwa_prompt_dismissed", {
                platform: label,
                source,
                ...(via ? { via } : {}),
            });
        },
        accept: (via) => {
            closeInstallSheet();
            gaEvent("pwa_prompt_accepted", { platform: label, source, via });
        },
        fail: () => {
            gaEvent("pwa_prompt_failed", { platform: label, source });
            openInstallSheet("android-menu", source);
        },
    };
}

/**
 * "앱 설치하기" 버튼. 설치할 수 없는 환경이면 **아무것도 그리지 않는다** —
 * 놓는 쪽은 자리를 비워 둘 필요가 없다.
 */
export function InstallEntryButton({
    className,
    onOpen,
}: {
    className?: string;
    /** 누른 직후 — 드로어를 닫는 데 쓴다 */
    onOpen?: () => void;
}) {
    const { env, deferred } = useInstallInputs();

    if (!env || env.state?.installed || !canOffer(env.platform, deferred)) {
        return null;
    }

    const label = platformLabel(env.platform);

    const onClick = () => {
        onOpen?.();
        if (env.platform.kind === "android") {
            // Android 는 중간 안내 없이 곧바로 네이티브 설치창
            gaEvent("pwa_prompt_shown", { platform: label, source: "menu" });
            void runNativePrompt(deferred, sheetHandlers(label, "menu"));
            return;
        }
        openInstallSheet();
    };

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "text-brand hover:bg-brand/10 flex items-center gap-2 rounded-lg font-semibold transition-colors",
                className,
            )}
        >
            <Download className="size-4" />앱 설치하기
        </button>
    );
}

/**
 * 메뉴에서 연 시트를 그리는 곳 — root layout 에 하나.
 */
export function InstallSheetHost() {
    const sheet = useSyncExternalStore(
        subscribeInstallSheet,
        getInstallSheet,
        getServerInstallSheet,
    );
    const { env, deferred } = useInstallInputs();
    const label = env ? platformLabel(env.platform) : "";

    useEffect(() => {
        if (sheet.open)
            gaEvent("pwa_prompt_shown", {
                platform: label,
                source: sheet.source,
                ...(sheet.variant === "android-menu"
                    ? { variant: sheet.variant }
                    : {}),
            });
    }, [sheet, label]);

    if (!env) return null;

    return (
        <InstallSheet
            open={sheet.open}
            platform={env.platform}
            deferred={deferred}
            variant={sheet.variant}
            handlers={sheetHandlers(label, sheet.source)}
        />
    );
}

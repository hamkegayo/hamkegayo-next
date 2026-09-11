"use client";

import { useEffect } from "react";

import { gaEvent } from "@/lib/analytics";
import { recordInstall } from "./install-prompt-store";

/**
 * 설치 감지 (#117) — 모든 화면에서 듣는다.
 *
 *  설치는 우리 모달로만 일어나지 않는다. Chrome 메뉴의 "앱 설치" 로도 된다.
 *  그래서 모달이 있는 /login·/signup 이 아니라 root layout 에 둔다.
 *  설치되면 설치 유도를 영구 중단한다.
 *
 *  iOS 는 이 이벤트가 없다. 대신 설치한 앱은 standalone 으로 열려
 *  판정 단계에서 걸러진다(lib/pwa/platform.ts).
 */
export function InstallTracker() {
    useEffect(() => {
        const onInstalled = () => {
            recordInstall();
            gaEvent("pwa_installed");
        };
        window.addEventListener("appinstalled", onInstalled);
        return () => window.removeEventListener("appinstalled", onInstalled);
    }, []);

    return null;
}

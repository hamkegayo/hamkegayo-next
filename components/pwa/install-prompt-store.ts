"use client";

/**
 * 설치 유도 모달의 판정 입력 (#117) — 플랫폼 · 저장된 정책 상태.
 *
 *  둘 다 브라우저에서만 알 수 있고 한 번 계산하면 바뀌지 않는다(닫기·설치
 *  때만 바뀐다). zoom-provider 처럼 모듈 스토어로 두고
 *  `useSyncExternalStore` 로 읽는다 — 서버에서는 null 이라 SSR·hydration
 *  동안에는 모달이 뜨지 않는다.
 *
 *  `eligible` 을 스냅숏에 담아 두는 이유: 렌더 중에 `Date.now()` 를 부르면
 *  렌더가 순수하지 않게 된다. 시각은 스냅숏을 만들 때 한 번만 읽는다.
 */

import { readConsent } from "@/lib/consent";
import { detectPlatform, type Platform } from "@/lib/pwa/platform";
import {
    afterDismiss,
    afterInstall,
    INITIAL_STATE,
    isEligible,
    loadState,
    saveState,
    type PromptState,
} from "@/lib/pwa/prompt-policy";

export type PromptEnv = {
    platform: Platform;
    /** null = 저장소를 쓸 수 없다 → 띄우지 않는다 */
    state: PromptState | null;
    eligible: boolean;
    /**
     * 이 방문을 시작할 때 쿠키 동의가 미처리였다 — 동의 배너가 먼저 뜬다.
     *  배너가 닫힌 뒤 잠깐 쉬었다 띄운다(install-prompt.tsx BANNER_GAP_MS).
     *
     *  훅의 bannerOpen 으로 판단하지 않는 이유: hydration 첫 렌더에서는 서버
     *  스냅숏(동의값 null)이라 **누구에게나 true** 로 나온다. 원본을 읽는다.
     */
    consentPending: boolean;
};

let snapshot: PromptEnv | null = null;
const listeners = new Set<() => void>();

/** 저장소 접근 자체가 throw 하는 브라우저가 있다 */
function storage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function isStandalone(): boolean {
    return (
        window.matchMedia?.("(display-mode: standalone)").matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

function build(state: PromptState | null): PromptEnv {
    return {
        platform: detectPlatform({
            userAgent: navigator.userAgent,
            standalone: isStandalone(),
            maxTouchPoints: navigator.maxTouchPoints ?? 0,
        }),
        state,
        eligible: state !== null && isEligible(state, Date.now()),
        consentPending: readConsent() === null,
    };
}

function emit() {
    listeners.forEach((l) => l());
}

export function subscribePromptEnv(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
}

export function getPromptEnv(): PromptEnv {
    if (!snapshot) snapshot = build(loadState(storage()));
    return snapshot;
}

export function getServerPromptEnv(): null {
    return null;
}

/** 한 번 닫았다 — 기록하고 닫힌 상태로. 새 횟수를 돌려준다. */
export function recordDismiss(): number {
    const env = getPromptEnv();
    if (!env.state) return 0;
    const next = afterDismiss(env.state, Date.now());
    saveState(storage(), next);
    // 저장이 실패해도 이번 화면에서는 닫는다. 다음 방문에서 읽기도 실패하면
    // 어차피 안 뜬다(loadState → null).
    snapshot = { ...env, state: next, eligible: false };
    emit();
    return next.count;
}

/** 설치했다 — 영구 중단 */
export function recordInstall(): void {
    const env = getPromptEnv();
    const next = afterInstall(env.state ?? INITIAL_STATE);
    saveState(storage(), next);
    snapshot = { ...env, state: next, eligible: false };
    emit();
}

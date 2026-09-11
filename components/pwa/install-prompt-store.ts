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

/* ---------- 메뉴에서 여는 설치 시트 (#139) ---------- */

/**
 * 시트 열림 상태. 버튼은 여는 신호만 보내고 시트는 root layout 의
 * InstallSheetHost 가 그린다 — 드로어는 링크를 누르면 닫히므로 드로어 안에
 * 그리면 함께 사라진다.
 */
export type SheetState = {
    open: boolean;
    /** 보통은 플랫폼대로, 설치창을 못 열었으면 Chrome 메뉴 안내 */
    variant: "platform" | "android-menu";
    /** 누가 열었나 — 계측용. 이 시트는 어느 쪽이 열었든 닫기를 세지 않는다 */
    source: "auto" | "menu";
};

const CLOSED: SheetState = { open: false, variant: "platform", source: "menu" };
let sheet: SheetState = CLOSED;
const sheetListeners = new Set<() => void>();

export function subscribeInstallSheet(onChange: () => void): () => void {
    sheetListeners.add(onChange);
    return () => sheetListeners.delete(onChange);
}

export function getInstallSheet(): SheetState {
    return sheet;
}

export function getServerInstallSheet(): SheetState {
    return CLOSED;
}

export function openInstallSheet(
    variant: SheetState["variant"] = "platform",
    source: SheetState["source"] = "menu",
): void {
    sheet = { open: true, variant, source };
    sheetListeners.forEach((l) => l());
}

export function closeInstallSheet(): void {
    if (!sheet.open) return;
    sheet = { ...sheet, open: false };
    sheetListeners.forEach((l) => l());
}

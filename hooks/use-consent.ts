"use client";

import { useSyncExternalStore } from "react";

import { readConsent, writeConsent, type ConsentValue } from "@/lib/consent";

/**
 * 애널리틱스 동의 상태 훅 (localStorage 동기화 외부 스토어).
 * 배너·스크립트 로더·푸터 "쿠키 설정" 링크가 상태를 공유한다.
 */
type State = {
    /** 저장된 동의값 (미선택 null) */
    value: ConsentValue | null;
    /** "쿠키 설정"으로 다시 연 경우 배너 강제 표시 */
    forceOpen: boolean;
};

const store = {
    state: { value: null, forceOpen: false } as State,
    initialized: false,
    listeners: new Set<() => void>(),
};

function ensureInit() {
    if (store.initialized) return;
    store.initialized = true;
    const v = readConsent();
    if (v) store.state = { value: v, forceOpen: false };
}

function emit() {
    store.listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
    ensureInit();
    store.listeners.add(cb);
    return () => {
        store.listeners.delete(cb);
    };
}

function getSnapshot() {
    return store.state;
}

const SERVER_STATE: State = { value: null, forceOpen: false };
function getServerSnapshot() {
    return SERVER_STATE;
}

function persist(value: ConsentValue) {
    writeConsent(value);
    store.state = { value, forceOpen: false };
    emit();
}

export function reopenConsentBanner() {
    ensureInit();
    store.state = { ...store.state, forceOpen: true };
    emit();
}

export function useConsent() {
    const state = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot,
    );

    return {
        consent: state.value,
        granted: state.value === "granted",
        bannerOpen: state.value === null || state.forceOpen,
        accept: () => persist("granted"),
        reject: () => {
            // 동의 철회(granted→denied) 시 이미 로드된 GA/Pixel 의 자동수집까지
            // 멈추려면 새로고침이 가장 확실하다. 최초 선택(null→denied)은 스크립트가
            // 아직 로드되지 않았으므로 새로고침 불필요.
            const wasGranted = store.state.value === "granted";
            persist("denied");
            if (wasGranted && typeof window !== "undefined") {
                window.location.reload();
            }
        },
        /** 배너를 선택 없이 닫기 (미선택 상태 유지) */
        dismiss: () => {
            store.state = { ...store.state, forceOpen: false };
            emit();
        },
        /** 푸터 "쿠키 설정"에서 배너 재오픈 */
        reopen: reopenConsentBanner,
    };
}

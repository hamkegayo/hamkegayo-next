"use client";

/**
 * PWA 설치 진단 표시 — `?pwa-debug=1` 로 켠다.
 *
 *  실기기에서 "설치하기를 눌렀는데 아무 일도 없다" 가 났는데 헤드리스
 *  Chrome 으로는 재현되지 않았다(스테이징 · 실제 제스처 · 실제 이벤트 모두
 *  정상). 원격 디버깅(USB) 없이 **폰 화면에서 흐름을 직접 보려고** 둔다.
 *
 *  - 켜기: 주소 뒤에 `?pwa-debug=1` — 이 탭(sessionStorage)에서 유지된다
 *  - 끄기: `?pwa-debug=0` 또는 패널의 "끄기"
 *  - "복사" 로 기록을 통째로 붙여 넣을 수 있다
 *
 *  기록 자체는 늘 남는다(lib/pwa/install-event.ts pwaLog) — 몇 줄뿐이다.
 *  같은 기록이 콘솔에도 `console.debug("[pwa]", …)` 로 나간다 — 원격 디버깅은 그쪽으로.
 *  켜면 창 포커스·가시성 변화도 함께 남긴다: 설치창이 떴다면 대개 페이지가
 *  포커스를 잃는다.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import {
    getPwaLogSize,
    getServerPwaLogSize,
    pwaLog,
    subscribePwaLog,
} from "@/lib/pwa/install-event";
import { platformLabel } from "@/lib/pwa/platform";
import { getPromptEnv } from "./install-prompt-store";

const FLAG_KEY = "hamkegayo:pwa-debug";

/** 쿼리로 켜고 끄며, 이 탭 동안 유지한다 */
let enabled: boolean | null = null;
function isEnabled(): boolean {
    if (enabled !== null) return enabled;
    try {
        const q = new URLSearchParams(window.location.search).get("pwa-debug");
        if (q === "1") sessionStorage.setItem(FLAG_KEY, "1");
        if (q === "0") sessionStorage.removeItem(FLAG_KEY);
        enabled = sessionStorage.getItem(FLAG_KEY) === "1";
    } catch {
        enabled = false;
    }
    return enabled;
}

const noopSubscribe = () => () => {};

export function PwaDebug() {
    const on = useSyncExternalStore(noopSubscribe, isEnabled, () => false);
    // 기록이 늘 때마다 다시 그린다 — 줄 수만 스냅숏으로 쓴다
    useSyncExternalStore(subscribePwaLog, getPwaLogSize, getServerPwaLogSize);
    const [hidden, setHidden] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!on) return;
        const env = getPromptEnv();
        pwaLog(
            `진단 시작 — ${platformLabel(env.platform)} · 이벤트 ${window.__hamkegayoBip ? "있음" : "없음"} · 자동모달 ${env.eligible ? "대상" : "비대상"}`,
        );
        const onBlur = () => pwaLog("창 포커스 잃음");
        const onFocus = () => pwaLog("창 포커스 돌아옴");
        const onVis = () => pwaLog(`가시성 ${document.visibilityState}`);
        window.addEventListener("blur", onBlur);
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVis);
        return () => {
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [on]);

    if (!on || hidden) return null;

    const log = window.__hamkegayoPwaLog ?? [];
    const t0 = log[0]?.[0] ?? 0;
    const lines = log.map(
        ([t, m]) => `+${((t - t0) / 1000).toFixed(1)}s  ${m}`,
    );
    const text = [navigator.userAgent, ...lines].join("\n");

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch {
            // 복사가 막히면 화면을 캡처해 보내면 된다
        }
    };

    const off = () => {
        try {
            sessionStorage.removeItem(FLAG_KEY);
        } catch {
            // 저장소가 막혀도 이번 화면에서는 닫는다
        }
        setHidden(true);
    };

    return (
        <div className="fixed inset-x-2 bottom-2 z-[70] max-h-[40vh] overflow-y-auto rounded-lg bg-black/85 p-2 font-mono text-[11px] leading-snug text-white">
            <div className="mb-1 flex items-center gap-2">
                <span className="font-bold">PWA 진단</span>
                <button
                    type="button"
                    onClick={copy}
                    className="ml-auto rounded bg-white/20 px-2 py-0.5"
                >
                    {copied ? "복사됨" : "복사"}
                </button>
                <button
                    type="button"
                    onClick={off}
                    className="rounded bg-white/20 px-2 py-0.5"
                >
                    끄기
                </button>
            </div>
            <p className="break-all text-white/60">{navigator.userAgent}</p>
            {lines.length === 0 ? (
                <p className="text-white/60">(기록 없음)</p>
            ) : (
                lines.map((l, i) => <p key={i}>{l}</p>)
            )}
        </div>
    );
}

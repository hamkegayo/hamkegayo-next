"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 기본 폴링 주기 — 수락 대기 요청은 분 단위로 들어오므로 15초면 충분하다. */
const DEFAULT_INTERVAL_MS = 15_000;

/**
 * 서버 컴포넌트 화면을 주기적으로 다시 불러온다 (#46 후속).
 *
 * router.refresh() 는 RSC 트리 전체를 재검증하므로 목록뿐 아니라
 * 레이아웃에서 계산하는 사이드바 뱃지·헤더 알림 개수까지 함께 맞는다.
 *
 *  - 탭이 보이지 않으면 요청하지 않는다(백그라운드 탭 낭비 방지).
 *  - 다른 탭을 보다 돌아오면 다음 주기를 기다리지 않고 즉시 갱신한다.
 *  - 화면에 아무것도 그리지 않는다.
 */
export function AutoRefresh({
    intervalMs = DEFAULT_INTERVAL_MS,
}: {
    intervalMs?: number;
}) {
    const router = useRouter();

    useEffect(() => {
        const refreshIfVisible = () => {
            if (document.visibilityState === "visible") router.refresh();
        };

        const id = setInterval(refreshIfVisible, intervalMs);
        document.addEventListener("visibilitychange", refreshIfVisible);

        return () => {
            clearInterval(id);
            document.removeEventListener("visibilitychange", refreshIfVisible);
        };
    }, [router, intervalMs]);

    return null;
}

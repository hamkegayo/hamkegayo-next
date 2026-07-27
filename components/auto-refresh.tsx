"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 서버 컴포넌트 화면을 주기적으로 갱신(router.refresh)하는 경량 폴러.
 *  - 새 데이터(예: 서비스 진행 상태, 파트너 수락 요청)가 새로고침 없이 반영되도록 한다.
 *  - 탭이 백그라운드일 때는 갱신을 건너뛴다(불필요한 요청 방지).
 */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
    const router = useRouter();

    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState === "visible") {
                router.refresh();
            }
        }, intervalMs);
        return () => clearInterval(id);
    }, [router, intervalMs]);

    return null;
}

"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록 (#116).
 *
 *  - **프로덕션 빌드에서만** 등록한다. `next dev` 에서 등록하면 HMR 과 엉키고,
 *    나중에 캐싱을 붙였을 때 stale 번들을 문다. 스테이징·PR 프리뷰도
 *    프로덕션 빌드라 등록된다 — PWA 는 거기서 검증해야 한다(고정 도메인).
 *  - `NEXT_PUBLIC_SW_KILL=1` 이면 등록 대신 **해제**한다. 잘못 배포한 SW 를
 *    되돌리는 수단이다. 값을 넣고 재배포하면 다음 방문부터 풀린다.
 *  - 화면에 아무것도 그리지 않는다.
 */
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") return;
        if (!("serviceWorker" in navigator)) return;

        if (process.env.NEXT_PUBLIC_SW_KILL === "1") {
            navigator.serviceWorker
                .getRegistrations()
                .then((regs) => Promise.all(regs.map((r) => r.unregister())))
                .catch(() => {});
            return;
        }

        navigator.serviceWorker
            .register("/sw.js", { scope: "/", updateViaCache: "none" })
            .catch((e) => {
                // 등록 실패는 앱 사용을 막지 않는다 — 설치만 안 될 뿐이다.
                console.error("[sw] 등록 실패:", e);
            });
    }, []);

    return null;
}

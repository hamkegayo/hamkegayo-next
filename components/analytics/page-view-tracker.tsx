"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { trackPageView } from "@/lib/analytics";

/**
 * 라우트 변경 시 수동 page_view 전송.
 * 최초 로드는 GA config / Pixel init 이 page_view 를 1회 자동 전송하므로,
 * 첫 렌더는 건너뛰어(ref) 중복 집계를 막는다. (useSearchParams 로 Suspense 필요)
 */
export function PageViewTracker() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isFirst = useRef(true);

    useEffect(() => {
        if (isFirst.current) {
            isFirst.current = false;
            return;
        }
        const query = searchParams.toString();
        trackPageView(query ? `${pathname}?${query}` : pathname);
    }, [pathname, searchParams]);

    return null;
}

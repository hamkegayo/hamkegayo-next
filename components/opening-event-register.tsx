"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 쿠폰함을 연 사용자의 이메일 식별값을 POST로 등록한 뒤 화면을 다시 그린다 (#283 리뷰).
 * 서버 렌더링(프리페치 포함)에서는 저장하지 않는다.
 */
export function OpeningEventRegister() {
    const router = useRouter();
    useEffect(() => {
        let alive = true;
        fetch("/api/campaigns/opening/register", {
            method: "POST",
            cache: "no-store",
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((result) => {
                if (alive && result?.registered) router.refresh();
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [router]);
    return null;
}

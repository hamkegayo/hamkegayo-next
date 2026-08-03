"use client";

import { useConsent } from "@/hooks/use-consent";

/** 푸터용 "쿠키 설정" 링크 — 클릭 시 동의 배너를 다시 연다. */
export function CookieSettingsButton() {
    const { reopen } = useConsent();
    return (
        <button
            type="button"
            onClick={reopen}
            className="hover:text-foreground underline-offset-2 transition-colors hover:underline"
        >
            쿠키 설정
        </button>
    );
}

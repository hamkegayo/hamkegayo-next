"use client";

import { useConsent } from "@/hooks/use-consent";

/**
 * 비차단 하단 동의 배너.
 * 미선택(또는 "쿠키 설정"으로 재오픈) 시 표시되며, 거부해도 사이트는 그대로 사용 가능.
 * 동의 시에만 GA4/Meta Pixel 스크립트가 로드된다.
 */
export function ConsentBanner() {
    const { bannerOpen, accept, reject } = useConsent();

    if (!bannerOpen) return null;

    return (
        <div
            role="dialog"
            aria-label="쿠키 사용 동의"
            className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4"
        >
            <div className="border-border bg-popover text-popover-foreground mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-sm leading-relaxed">
                    함께가요는 서비스 개선과 마케팅을 위해 GA4·Meta Pixel 쿠키를
                    사용합니다. 동의하시면 방문·전환 통계 수집에 활용됩니다.
                    거부하셔도 서비스 이용에는 영향이 없습니다.
                </p>
                <div className="flex shrink-0 gap-2">
                    <button
                        type="button"
                        onClick={reject}
                        className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-bold transition-colors"
                    >
                        거부
                    </button>
                    <button
                        type="button"
                        onClick={accept}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-4 py-2 text-sm font-bold transition-colors"
                    >
                        동의
                    </button>
                </div>
            </div>
        </div>
    );
}

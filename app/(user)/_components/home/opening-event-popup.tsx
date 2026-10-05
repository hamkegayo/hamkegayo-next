"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, MessageCircle, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogClose,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ContactLink } from "./contact-link";
import {
    OPENING_EVENT_CHANNEL,
    OPENING_EVENT_DISMISS_KEY,
    OPENING_EVENT_TERMS,
    openingEventLocalDate,
} from "@/lib/opening-event";

export function OpeningEventPopup({
    enabled,
    preview = false,
    previewAutoOpen = false,
    reservationHref = "/reservation",
}: {
    enabled: boolean;
    preview?: boolean;
    previewAutoOpen?: boolean;
    reservationHref?: string;
}) {
    const dismissedDate = useRef<string | null>(null);
    const [open, setOpen] = useState(preview && previewAutoOpen);
    useEffect(() => {
        if (preview || !enabled) return;
        const refresh = async () => {
            try {
                if (dismissedDate.current === openingEventLocalDate()) return;
                if (
                    localStorage.getItem(OPENING_EVENT_DISMISS_KEY) ===
                    openingEventLocalDate()
                )
                    return;
                const response = await fetch("/api/campaigns/opening/status", {
                    cache: "no-store",
                });
                const status = await response.json();
                setOpen(response.ok && status.enabled === true);
            } catch {
                setOpen(false);
            }
        };
        void refresh();
        const timer = setInterval(() => void refresh(), 30000);
        return () => clearInterval(timer);
    }, [enabled, preview]);
    const changeOpen = (next: boolean) => {
        setOpen(next);
        if (!next && !preview) {
            dismissedDate.current = openingEventLocalDate();
            try {
                localStorage.setItem(
                    OPENING_EVENT_DISMISS_KEY,
                    openingEventLocalDate(),
                );
            } catch {
                /* 저장 차단 환경에서도 닫기는 동작한다. */
            }
        }
    };
    return (
        <Dialog open={open} onOpenChange={changeOpen}>
            {preview && !previewAutoOpen && (
                <DialogTrigger className="border-border bg-background hover:bg-muted focus-visible:ring-brand cursor-pointer rounded-lg border px-4 py-2 font-bold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    팝업 시안 미리보기
                </DialogTrigger>
            )}
            <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto rounded-3xl p-5 sm:p-8">
                <div className="flex items-center justify-between gap-4">
                    <Image
                        src="/common/logo-wordmark.png"
                        alt="함께가요"
                        width={145}
                        height={42}
                    />
                    <DialogClose
                        aria-label="이벤트 팝업 닫기"
                        className="text-foreground hover:bg-muted focus-visible:ring-brand cursor-pointer rounded-full p-2 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        <X className="size-6" />
                    </DialogClose>
                </div>
                <DialogTitle className="mt-6 text-3xl leading-tight font-extrabold break-keep sm:text-4xl">
                    첫 병원동행,
                    <br />
                    <span className="text-brand">1시간 무료</span>로 시작하세요
                </DialogTitle>
                <DialogDescription className="mt-3 text-base">
                    병원동행을 부담 없이 시작해 보세요.
                </DialogDescription>
                {previewAutoOpen && (
                    <p
                        role="status"
                        className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900"
                    >
                        스테이징 시안 미리보기 · 실제 할인은 적용되지 않습니다.
                    </p>
                )}
                <div
                    className="relative mt-6 rounded-2xl bg-linear-to-br from-[#00b5ff] to-[#0089ee] px-7 pt-7 pb-5 text-center text-white sm:px-9 sm:pt-8 sm:pb-6"
                    style={{
                        maskImage:
                            "radial-gradient(circle at left center, transparent 0 16px, black 16.5px), radial-gradient(circle at right center, transparent 0 16px, black 16.5px)",
                        maskComposite: "intersect",
                    }}
                >
                    <p className="text-lg font-bold sm:text-xl">선착순 20명</p>
                    <p className="mt-3 text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
                        첫 1시간 이용 무료
                    </p>
                    <p className="mt-2 text-lg font-bold">
                        (Plus 25,000원 · Basic 20,000원 상당)
                    </p>
                    <div
                        aria-hidden="true"
                        className="mt-6 border-t-2 border-dashed border-white/80"
                    />
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    {preview ? (
                        <button
                            type="button"
                            disabled
                            className="bg-brand text-brand-foreground relative flex flex-1 cursor-not-allowed items-center justify-center rounded-2xl px-12 py-4 text-center text-lg font-extrabold"
                        >
                            예약하기
                            <ChevronRight
                                aria-hidden="true"
                                className="absolute right-4 size-6"
                            />
                        </button>
                    ) : (
                        <Link
                            href={reservationHref}
                            onClick={() => changeOpen(false)}
                            className="bg-brand text-brand-foreground hover:bg-brand/90 focus-visible:ring-brand relative flex flex-1 cursor-pointer items-center justify-center rounded-2xl px-12 py-4 text-center text-lg font-extrabold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            예약하기
                            <ChevronRight
                                aria-hidden="true"
                                className="absolute right-4 size-6"
                            />
                        </Link>
                    )}
                    {preview ? (
                        <button
                            type="button"
                            disabled
                            className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-[#fee500] p-4 text-lg font-extrabold text-black"
                        >
                            <MessageCircle className="size-6 fill-black" />
                            카카오톡 상담하기
                        </button>
                    ) : (
                        <ContactLink
                            href={OPENING_EVENT_CHANNEL}
                            method="support"
                            external
                            className="focus-visible:ring-brand flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#fee500] p-4 text-lg font-extrabold text-black transition-colors hover:bg-[#f0d900] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            <MessageCircle className="size-6 fill-black" />
                            카카오톡 상담하기
                            <ChevronRight className="size-6" />
                        </ContactLink>
                    )}
                </div>
                <p className="text-muted-foreground mt-3 text-center text-xs">
                    상담 신청이나 버튼 클릭이 아닌 실제 예약 확정 순으로 혜택이
                    적용됩니다.
                </p>
                <details className="text-muted-foreground mt-4 text-xs leading-relaxed">
                    <summary className="text-foreground cursor-pointer font-bold">
                        혜택 적용 조건 확인
                    </summary>
                    <ul className="mt-2 space-y-2">
                        {OPENING_EVENT_TERMS.map((term) => (
                            <li key={term}>{term}</li>
                        ))}
                    </ul>
                </details>
                {preview && (
                    <p className="mt-3 text-xs text-amber-700">
                        시안 검토 화면입니다. 두 버튼은 이동하지 않습니다. 이
                        시안에서는 예약·상담 요청이나 실제 할인 적용을 실행하지
                        않습니다.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}

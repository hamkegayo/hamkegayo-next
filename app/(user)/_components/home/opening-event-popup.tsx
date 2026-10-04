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
    reservationHref = "/reservation",
}: {
    enabled: boolean;
    preview?: boolean;
    reservationHref?: string;
}) {
    const dismissedDate = useRef<string | null>(null);
    const [open, setOpen] = useState(false);
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
            {preview && (
                <DialogTrigger className="border-border bg-background rounded-lg border px-4 py-2 font-bold">
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
                        className="text-foreground rounded-full p-2"
                    >
                        <X className="size-6" />
                    </DialogClose>
                </div>
                <DialogTitle className="mt-6 text-3xl leading-tight font-extrabold sm:text-4xl">
                    첫 병원동행,
                    <br />
                    <span className="text-brand">1시간 무료</span>로 시작하세요
                </DialogTitle>
                <DialogDescription className="mt-3 text-base">
                    병원동행을 부담 없이 시작해 보세요.
                </DialogDescription>
                <div className="bg-brand text-brand-foreground mt-6 rounded-2xl px-4 py-6 text-center">
                    <p className="text-lg font-bold">선착순 20명</p>
                    <p className="mt-2 text-3xl font-extrabold sm:text-4xl">
                        첫 1시간 이용 무료
                    </p>
                    <p className="mt-2 text-lg font-bold">
                        (Plus 25,000원 · Basic 20,000원 상당)
                    </p>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    {preview ? (
                        <button
                            type="button"
                            disabled
                            className="bg-brand text-brand-foreground flex flex-1 items-center justify-center gap-2 rounded-2xl p-4 text-lg font-extrabold"
                        >
                            예약하기 <ChevronRight className="size-6" />
                        </button>
                    ) : (
                        <Link
                            href={reservationHref}
                            onClick={() => changeOpen(false)}
                            className="bg-brand text-brand-foreground hover:bg-brand/90 flex flex-1 items-center justify-center gap-2 rounded-2xl p-4 text-lg font-extrabold"
                        >
                            예약하기 <ChevronRight className="size-6" />
                        </Link>
                    )}
                    {preview ? (
                        <button
                            type="button"
                            disabled
                            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#fee500] p-4 text-lg font-extrabold text-black"
                        >
                            <MessageCircle className="size-6 fill-black" />
                            카카오톡 상담하기
                        </button>
                    ) : (
                        <ContactLink
                            href={OPENING_EVENT_CHANNEL}
                            method="support"
                            external
                            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#fee500] p-4 text-lg font-extrabold text-black"
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
                        시안 검토 화면입니다. 두 버튼은 이동하지 않습니다.
                        이메일 인증·운영 조건 확인 전 실제 할인과 고객 팝업은
                        비활성입니다.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}

"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";

import { isUrgentReservation } from "@/lib/urgent-reservation";
import {
    CUSTOMER_CENTER_CALL_LABEL,
    CUSTOMER_CENTER_TEL_HREF,
    URGENT_NOTICE_BASE,
    URGENT_NOTICE_COMPLETE_EMPHASIS,
    URGENT_NOTICE_EMPHASIS,
} from "@/lib/direct-flow-copy";
import { PhoneContactLink } from "@/components/contact/phone-contact-link";

export type UrgentCallContext = "pre-payment" | "complete";

/** 표시만 담당한다(테스트 용이). 급한 예약이면 강조하지만 결제를 막지 않는다. */
export function UrgentCallNoticeView({
    urgent,
    context = "pre-payment",
    hideCallButtonWhenNormal = false,
}: {
    urgent: boolean;
    context?: UrgentCallContext;
    /** 완료 화면처럼 상단에 이미 주 전화 CTA가 있을 때 일반 상태의 중복 버튼을 숨긴다. */
    hideCallButtonWhenNormal?: boolean;
}) {
    const emphasisMessage =
        context === "complete"
            ? URGENT_NOTICE_COMPLETE_EMPHASIS
            : URGENT_NOTICE_EMPHASIS;
    const showButton = urgent || !hideCallButtonWhenNormal;

    return (
        <div
            data-urgent={urgent ? "true" : "false"}
            className={
                urgent
                    ? "flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
                    : "border-border bg-muted/30 flex items-start gap-3 rounded-xl border p-4 text-sm"
            }
        >
            <Phone
                className={
                    urgent
                        ? "mt-0.5 size-4 shrink-0 text-amber-600"
                        : "text-muted-foreground mt-0.5 size-4 shrink-0"
                }
            />
            <div className="min-w-0 flex-1 leading-relaxed">
                <p
                    className={
                        urgent
                            ? "text-foreground font-bold"
                            : "text-muted-foreground"
                    }
                >
                    {urgent ? emphasisMessage : URGENT_NOTICE_BASE}
                </p>
                {showButton && (
                    <PhoneContactLink
                        href={CUSTOMER_CENTER_TEL_HREF}
                        className={
                            urgent
                                ? "bg-background mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/70 px-3.5 py-2 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100/60 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/20"
                                : "border-border bg-background text-foreground hover:bg-muted mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors"
                        }
                    >
                        <Phone className="size-3.5" />
                        {CUSTOMER_CENTER_CALL_LABEL}
                    </PhoneContactLink>
                )}
            </div>
        </div>
    );
}

/**
 * 급한 예약 전화 상담 안내 — 예약 입력·결제 전·완료 화면에서 쓴다.
 * 현재 시각은 마운트 뒤에 읽는다(서버·브라우저 시간 차로 하이드레이션이 어긋나지 않게).
 */
export function UrgentCallNotice({
    useDate,
    time,
    context = "pre-payment",
    hideCallButtonWhenNormal = false,
}: {
    useDate: string;
    time: string;
    context?: UrgentCallContext;
    hideCallButtonWhenNormal?: boolean;
}) {
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        // 마운트 뒤에 읽는다 — 콜백 안에서 설정해 렌더 중 연쇄 갱신을 피한다.
        const first = setTimeout(() => setNow(Date.now()), 0);
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => {
            clearTimeout(first);
            clearInterval(id);
        };
    }, []);

    const urgent = now !== null && isUrgentReservation(useDate, time, now);
    return (
        <UrgentCallNoticeView
            urgent={urgent}
            context={context}
            hideCallButtonWhenNormal={hideCallButtonWhenNormal}
        />
    );
}

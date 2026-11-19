"use client";

/**
 * PC 웹 고객센터 전화 안내 모달 (#304).
 *
 *  PC 에서 `tel:` 를 누르면 전화 앱이 없어 아무 일도 없거나 OS 앱 선택 창만
 *  뜬다. 대신 번호(복사)·QR(휴대폰으로 스캔)·카카오톡 문의를 한 화면에 보여준다.
 *
 *  번호·상담 시간·카카오톡 주소는 COMPANY 한 곳에서만 읽는다 — 약관 부칙·
 *  처리방침·푸터와 어긋나지 않게 여기에 적지 않는다.
 *
 *  root layout 에 PhoneContactModalHost 를 한 번만 마운트한다. 버튼
 *  (phone-contact-link)은 phone-contact-store 로 여는 신호만 보낸다.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, MessageCircle, Phone, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { COMPANY } from "@/lib/legal/company";
import { isWithinSupportHours, normalizeTelHref } from "@/lib/phone-contact";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    closePhoneContactModal,
    getPhoneContactModal,
    getServerPhoneContactModal,
    subscribePhoneContactModal,
} from "./phone-contact-store";
import { PhoneQrCode } from "./phone-qr-code";

export {
    closePhoneContactModal,
    openPhoneContactModal,
    subscribePhoneContactModal,
} from "./phone-contact-store";

const COPIED_FEEDBACK_MS = 2000;

/** Clipboard API 가 없거나 거절되면(비보안 컨텍스트 등) 예전 방식으로 복사한다 */
async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // 아래 폴백으로 넘어간다
    }
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

function CopyNumberButton() {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    async function handleCopy() {
        const ok = await copyText(COMPANY.tel);
        if (!ok) {
            toast.error(
                "복사하지 못했습니다. 번호를 직접 입력해 전화해 주세요.",
            );
            return;
        }
        setCopied(true);
        toast.success("전화번호가 복사되었습니다.");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            data-copied={copied ? "true" : "false"}
            aria-label={copied ? "전화번호 복사됨" : "전화번호 복사"}
            className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                copied
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "border-border bg-background text-foreground hover:bg-muted",
            )}
        >
            {copied ? (
                <Check className="size-3.5" />
            ) : (
                <Copy className="size-3.5" />
            )}
            {copied ? "복사됨" : "복사"}
        </button>
    );
}

export function PhoneContactModal({
    open,
    openedAt,
    onClose,
}: {
    open: boolean;
    /** 모달을 연 시각(ms). null 이면 상담 가능 여부 배지를 그리지 않는다 */
    openedAt: number | null;
    onClose: () => void;
}) {
    // 연 시각으로만 판정한다 — 서버 렌더에는 openedAt 이 없어 배지가 없다.
    const within =
        openedAt === null ? null : isWithinSupportHours(new Date(openedAt));

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent
                data-testid="phone-contact-modal"
                className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <DialogTitle>고객센터 전화 안내</DialogTitle>
                        <DialogDescription className="mt-1 leading-relaxed">
                            휴대폰으로 아래 번호를 입력하시거나, QR 코드를
                            스캔해 전화해 주세요.
                        </DialogDescription>
                    </div>
                    <DialogClose
                        aria-label="닫기"
                        className="text-muted-foreground hover:bg-muted hover:text-foreground -mt-1 -mr-2 rounded-lg p-2 transition-colors"
                    >
                        <X className="size-5" />
                    </DialogClose>
                </div>

                {/* 번호 + 복사 */}
                <div className="border-border bg-muted/30 mt-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Phone className="text-brand size-5 shrink-0" />
                        <span
                            data-testid="phone-contact-number"
                            className="text-foreground text-2xl font-extrabold tracking-tight tabular-nums"
                        >
                            {COMPANY.tel}
                        </span>
                    </div>
                    <CopyNumberButton />
                </div>

                {/* QR */}
                <div className="mt-5 flex flex-col items-center">
                    <div className="border-border rounded-xl border bg-white p-2">
                        <PhoneQrCode className="size-40" />
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs">
                        휴대폰 카메라로 스캔하면 바로 전화가 연결됩니다
                    </p>
                </div>

                {/* 상담 시간 — 약관 부칙 — 고객센터 운영시간 06:00-18:00 */}
                <div
                    data-testid="phone-contact-hours"
                    data-within-hours={
                        within === null ? undefined : within ? "true" : "false"
                    }
                    className={cn(
                        "mt-5 rounded-xl border p-4 text-sm leading-relaxed",
                        within === false
                            ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                            : "border-border bg-muted/30",
                    )}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-foreground font-bold">
                            상담 시간: {COMPANY.hours}
                        </span>
                        {within !== null && (
                            <span
                                data-testid="phone-contact-hours-badge"
                                className={cn(
                                    "rounded-full px-2 py-0.5 text-xs font-bold",
                                    within
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                        : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
                                )}
                            >
                                {within
                                    ? "현재 상담 가능"
                                    : "현재 상담 시간 외"}
                            </span>
                        )}
                    </div>
                    {/* 약관 부칙에 요일 조건이 없다 — "평일"·"다음 영업일" 을 쓰지 않는다 */}
                    <p
                        className={cn(
                            "mt-2",
                            within === false
                                ? "font-semibold text-amber-900 dark:text-amber-200"
                                : "text-muted-foreground",
                        )}
                    >
                        상담 시간 외에는 전화 연결이 어려울 수 있으며, 카카오톡
                        문의를 남겨주시면 운영 시간에 순차적으로 안내해
                        드립니다.
                    </p>
                </div>

                {/* 개인정보처리방침 제14조 — 문의 방법 */}
                <a
                    href={COMPANY.kakaoUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="bg-kakao text-kakao-foreground mt-5 flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-bold transition-opacity hover:opacity-90"
                >
                    <MessageCircle className="size-4" />
                    카카오톡으로 문의하기
                </a>

                {/* PC 에 전화 앱이 연동된 사용자용. 일반 링크라 모달을 다시 열지 않는다 */}
                <div className="mt-3 text-center">
                    <a
                        href={normalizeTelHref(COMPANY.tel)}
                        className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                    >
                        전화 앱으로 연결
                    </a>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** root layout 에 한 번만 둔다 */
export function PhoneContactModalHost() {
    const { open, openedAt } = useSyncExternalStore(
        subscribePhoneContactModal,
        getPhoneContactModal,
        getServerPhoneContactModal,
    );
    return (
        <PhoneContactModal
            open={open}
            openedAt={openedAt}
            onClose={closePhoneContactModal}
        />
    );
}

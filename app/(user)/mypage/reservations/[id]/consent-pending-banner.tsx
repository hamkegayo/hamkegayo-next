"use client";

import { useState } from "react";
import { Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { reissueConsentLink } from "@/app/(user)/reservation/_actions/consent";

/**
 * 이용자 본인 동의 대기 안내 (개인정보처리방침 제10조 ①②, #306).
 * 링크 원문은 서버에 저장하지 않아 다시 볼 수 없다 — 새로 만들면 이전 링크는 즉시 폐기된다.
 * 동의가 끝나기 전에는 파트너 매칭·결제가 열리지 않는다.
 */
export function ConsentPendingBanner({
    reservationId,
}: {
    reservationId: string;
}) {
    const [link, setLink] = useState("");
    const [busy, setBusy] = useState(false);

    const reissue = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const res = await reissueConsentLink(reservationId);
            if (!res.ok) {
                toast.error(res.message);
                return;
            }
            setLink(res.link);
            toast.success(
                "새 링크를 만들었습니다. 이전 링크는 사용할 수 없습니다.",
            );
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            toast.success(
                "링크를 복사했습니다. 이용자 본인에게 전달해 주세요.",
            );
        } catch {
            toast.error("복사하지 못했습니다. 링크를 길게 눌러 복사해 주세요.");
        }
    };

    return (
        <div
            id="consent-pending-banner"
            className="border-brand/30 bg-brand/5 mt-5 rounded-2xl border p-5"
        >
            <div className="flex items-start gap-3">
                <ShieldCheck className="text-brand mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm font-bold">
                        이용자 본인 동의 대기 중
                    </p>
                    <p className="text-description-foreground mt-1 text-sm leading-relaxed">
                        이용자 본인이 동의 링크에서 직접 동의하면 파트너 매칭이
                        시작됩니다. 그 전에는 파트너에게 예약이 공개되지
                        않습니다. 링크가 만료됐거나 전달하지 못했다면 새로
                        만들어 주세요. 서비스 시작 예정시각까지 동의가 없으면
                        예약은 자동으로 취소됩니다.
                    </p>
                    {link && (
                        <div className="mt-3 flex gap-2">
                            <input
                                readOnly
                                value={link}
                                aria-label="본인 동의 링크"
                                onFocus={(e) => e.currentTarget.select()}
                                className="border-input bg-background h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"
                            />
                            <button
                                type="button"
                                onClick={copy}
                                className="bg-brand text-brand-foreground inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-bold"
                            >
                                <Copy className="size-4" />
                                복사
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        disabled={busy}
                        onClick={reissue}
                        className="border-border bg-background text-foreground hover:bg-muted mt-3 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50"
                    >
                        <RefreshCw className="size-4" />
                        링크 다시 만들기
                    </button>
                </div>
            </div>
        </div>
    );
}

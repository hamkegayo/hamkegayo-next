"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/app/(user)/_components/home/section";
import { newReservationMatchingMode } from "@/lib/direct-assignment";
import { useReservationStore } from "../_store/reservation-store";
import { totalStepsFor, stepAfterRegistration } from "../_lib/flow-branch";
import { getConsentStatus, reissueConsentLink } from "../_actions/consent";
import { cancelReservation } from "../_actions/matching";
import { resumeReservation } from "../_actions/payment";
import { StepBand } from "./step-band";

const POLL_MS = 5000;

function formatExpiry(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * 이용자 본인 동의 대기 화면 (개인정보처리방침 제10조 ①②, #306).
 *
 * 대리 예약에서 "이용자 본인이 직접 동의"를 고른 예약은 본인이 동의 링크에서 동의를 마칠 때까지
 * 파트너 매칭·결제가 열리지 않는다. 보호자는 여기서 링크를 복사해 전달하고, 만료되면 다시 발급한다.
 * 동의가 확인되면 기존 흐름(매칭 대기 또는 결제)으로 이어진다.
 */
export function StepConsentPending() {
    const { data, patch, goStep, finish } = useReservationStore();
    const router = useRouter();
    const reservationId = data.reservationId;
    const mode =
        data.matchingMode === "admin_direct"
            ? "admin_direct"
            : newReservationMatchingMode();

    const [link, setLink] = useState(data.consentLink);
    const [expiresAt, setExpiresAt] = useState(data.consentExpiresAt);
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const [closedNote, setClosedNote] = useState<string | null>(null);

    // 동의 완료·예약 종료를 주기적으로 확인한다.
    useEffect(() => {
        if (!reservationId) return;
        let alive = true;
        const poll = async () => {
            const s = await getConsentStatus(reservationId);
            if (!alive || !s) return;
            if (s.reservationStatus === "CANCELLED") {
                setClosedNote("예약이 취소되었습니다.");
                return;
            }
            if (s.status === "CONFIRMED") {
                if (data.matchingMode === "admin_direct") {
                    const state = await resumeReservation(reservationId);
                    if (!alive) return;
                    if (state) {
                        patch({
                            consentStatus: "CONFIRMED",
                            consentLink: "",
                            prepaidAmount: state.prepaidAmount,
                            pointBalance: state.pointBalance,
                            paymentDeadline: state.paymentDeadline,
                        });
                        goStep(stepAfterRegistration("admin_direct"));
                        return;
                    }
                }
                patch({ consentStatus: "CONFIRMED", consentLink: "" });
                // legacy_auto 는 consentStatus 가 풀리면 flow 가 5단계(매칭)를 그린다.
            }
        };
        poll();
        const timer = setInterval(poll, POLL_MS);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [reservationId, data.matchingMode, patch, goStep]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            toast.success(
                "링크를 복사했습니다. 이용자 본인에게 전달해 주세요.",
            );
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("복사하지 못했습니다. 링크를 길게 눌러 복사해 주세요.");
        }
    };

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
            setExpiresAt(res.expiresAt);
            patch({ consentLink: res.link, consentExpiresAt: res.expiresAt });
            toast.success(
                "새 링크를 만들었습니다. 이전 링크는 사용할 수 없습니다.",
            );
        } finally {
            setBusy(false);
        }
    };

    const cancel = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const res = await cancelReservation(reservationId);
            if (!res.ok) {
                toast.error(res.message);
                return;
            }
            finish();
            router.push("/mypage");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <StepBand
                index={5}
                totalSteps={totalStepsFor(mode)}
                title="이용자 본인의 동의를 기다리고 있어요."
                subtitles={[
                    "예약은 접수되었고, 이용자 본인이 동의하면 파트너 매칭이 시작됩니다.",
                    "동의가 끝나기 전에는 파트너에게 예약이 공개되지 않아요.",
                ]}
            />
            <Section>
                <div className="mx-auto max-w-3xl">
                    <div
                        id="consent-pending"
                        className="bg-panel-muted rounded-2xl p-6 md:p-8"
                    >
                        <div className="flex items-start gap-4">
                            <div className="bg-brand/10 text-brand flex size-12 shrink-0 items-center justify-center rounded-full">
                                <ShieldCheck className="size-6" />
                            </div>
                            <div>
                                <h2 className="text-foreground text-lg font-bold">
                                    이용자 본인 동의 대기 중
                                </h2>
                                <p className="text-description-foreground mt-1 text-sm leading-relaxed">
                                    아래 링크를 이용자 본인에게 전달해 주세요.
                                    이용자가 생년월일과 연락처 끝 4자리로 본인
                                    확인을 한 뒤 직접 동의합니다. 이 화면은
                                    동의가 확인되면 자동으로 넘어갑니다. 진료
                                    내용은 이용자 본인이 동의하기 전까지
                                    보호자에게 전달되지 않습니다.
                                </p>
                            </div>
                        </div>

                        {closedNote ? (
                            <p
                                role="status"
                                className="text-foreground mt-6 text-sm font-semibold"
                            >
                                {closedNote}
                            </p>
                        ) : link ? (
                            <div className="mt-6">
                                <label
                                    htmlFor="consent-link"
                                    className="text-foreground mb-2 block text-sm font-semibold"
                                >
                                    본인 동의 링크
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        id="consent-link"
                                        readOnly
                                        value={link}
                                        onFocus={(e) =>
                                            e.currentTarget.select()
                                        }
                                        className="border-input bg-background h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm"
                                    />
                                    <button
                                        id="consent-copy"
                                        type="button"
                                        onClick={copy}
                                        className="bg-brand text-brand-foreground hover:bg-brand/90 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-bold"
                                    >
                                        {copied ? (
                                            <Check className="size-4" />
                                        ) : (
                                            <Copy className="size-4" />
                                        )}
                                        복사
                                    </button>
                                </div>
                                {expiresAt && (
                                    <p className="text-muted-foreground mt-2 text-xs">
                                        {formatExpiry(expiresAt)}까지 유효합니다
                                        (최대 24시간, 서비스 시작 전까지).
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-description-foreground mt-6 text-sm leading-relaxed">
                                보안을 위해 링크 원문은 다시 볼 수 없습니다.
                                아래 버튼으로 새 링크를 만들어 주세요.
                            </p>
                        )}

                        {!closedNote && (
                            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                                <button
                                    id="consent-reissue"
                                    type="button"
                                    disabled={busy}
                                    onClick={reissue}
                                    className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center justify-center gap-1.5 rounded-lg border px-5 py-3 text-sm font-bold disabled:opacity-50"
                                >
                                    <RefreshCw className="size-4" />
                                    링크 다시 만들기
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={cancel}
                                    className="text-muted-foreground hover:text-foreground rounded-lg px-5 py-3 text-sm font-semibold underline-offset-4 hover:underline disabled:opacity-50"
                                >
                                    예약 취소
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </Section>
        </>
    );
}

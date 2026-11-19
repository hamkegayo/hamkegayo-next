import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, ChevronLeft, Phone, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    CUSTOMER_CENTER_CALL_LABEL,
    CUSTOMER_CENTER_TEL_HREF,
    DIRECT_CANCEL_NOTICE,
} from "@/lib/direct-flow-copy";
import {
    DIRECT_PHASE_LABEL,
    canCancelBeforeAssignment,
    directPhaseDescription,
    type DirectPhase,
    type RefundReason,
} from "@/lib/direct-reservation-status";
import { UrgentCallNoticeView } from "@/app/(user)/reservation/_components/urgent-call-notice";

function badgeTone(phase: DirectPhase): string {
    switch (phase) {
        case "REFUNDED":
            return "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15";
        case "REFUND_DELAYED":
            return "bg-red-100 text-red-600 dark:bg-red-500/15";
        case "REFUND_IN_PROGRESS":
        case "WAITING":
        case "UNPAID":
            return "bg-amber-100 text-amber-700 dark:bg-amber-500/15";
        default:
            return "bg-muted text-muted-foreground";
    }
}

/**
 * 신규 방식(#300) 예약 상세 — 표시 전용.
 *
 *  결제 전 / 결제 완료·배정 대기 / 취소·환불 진행 / 환불 완료를 구분해 보여준다.
 *  PG 취소가 끝나지 않은 환불(REFUND_IN_PROGRESS·REFUND_DELAYED)을 "환불 완료" 로 말하지 않는다.
 *  라우터·서버 액션은 래퍼(direct-reservation-view)가 맡는다.
 */
export function DirectReservationPanel({
    code,
    hospital,
    dateLabel,
    timeLabel,
    plan,
    phase,
    refundReason,
    urgent,
    pending,
    resumeHref,
    onCancelClick,
    onBack,
    notice,
}: {
    code: string;
    hospital: string;
    dateLabel: string;
    timeLabel: string;
    plan: string;
    phase: DirectPhase;
    refundReason: RefundReason | null;
    urgent: boolean;
    pending?: boolean;
    /** 결제 전 예약의 결제 화면 주소 */
    resumeHref?: string;
    onCancelClick?: () => void;
    onBack?: () => void;
    /** 예약 요약 카드 아래에 보여줄 안내(예: 이용자 본인 동의 대기) */
    notice?: ReactNode;
}) {
    const active = canCancelBeforeAssignment(phase);

    return (
        <div>
            <button
                type="button"
                onClick={onBack}
                className="text-foreground flex items-center gap-1.5 text-2xl font-extrabold"
            >
                <ChevronLeft className="size-6" />
                예약 상세
            </button>
            <p className="text-muted-foreground mt-2 text-sm">
                예약번호 {code}
            </p>

            <div className="border-border bg-background mt-6 rounded-2xl border p-6 md:p-7">
                <span
                    data-testid="direct-phase-badge"
                    className={cn(
                        "inline-block rounded-full px-3 py-1 text-xs font-bold",
                        badgeTone(phase),
                    )}
                >
                    {DIRECT_PHASE_LABEL[phase]}
                </span>
                <h2 className="text-foreground mt-4 flex items-center gap-2 text-xl font-extrabold">
                    <Building2 className="text-brand size-5 shrink-0" />
                    {hospital}
                </h2>
                <p className="text-muted-foreground mt-3 text-sm">
                    {dateLabel} {timeLabel} · {plan}
                </p>

                <p
                    data-testid="direct-phase-description"
                    className="text-foreground mt-5 text-sm leading-relaxed"
                >
                    {directPhaseDescription(phase, refundReason)}
                </p>

                {phase === "UNPAID" && resumeHref && (
                    <Link
                        href={resumeHref}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 mt-4 inline-flex rounded-lg px-5 py-2.5 text-sm font-bold transition-colors"
                    >
                        결제 이어하기
                    </Link>
                )}

                {active && (
                    <div className="border-border mt-5 border-t pt-4">
                        <p className="text-description-foreground text-xs leading-relaxed">
                            {phase === "WAITING"
                                ? DIRECT_CANCEL_NOTICE
                                : "결제 전 예약은 취소해도 요금이 청구되지 않습니다."}
                        </p>
                        <div className="mt-3 flex justify-end">
                            <button
                                type="button"
                                onClick={onCancelClick}
                                disabled={pending}
                                className="text-destructive hover:bg-destructive/5 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors disabled:opacity-60"
                            >
                                <XCircle className="size-4" />
                                {phase === "WAITING"
                                    ? "예약 취소(전액 환불)"
                                    : "예약 취소"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {notice}

            {(phase === "WAITING" || phase === "UNPAID") && (
                <div className="mt-4">
                    <UrgentCallNoticeView
                        urgent={urgent}
                        context={
                            phase === "WAITING" ? "complete" : "pre-payment"
                        }
                    />
                </div>
            )}

            {(phase === "REFUND_DELAYED" || phase === "REFUND_IN_PROGRESS") && (
                <a
                    href={CUSTOMER_CENTER_TEL_HREF}
                    className="border-border bg-background text-foreground hover:bg-muted mt-4 flex items-center justify-center gap-2 rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                >
                    <Phone className="size-4" />
                    {CUSTOMER_CENTER_CALL_LABEL}
                </a>
            )}
        </div>
    );
}

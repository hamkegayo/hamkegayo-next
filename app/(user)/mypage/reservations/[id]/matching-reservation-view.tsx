"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    Building2,
    CheckCircle2,
    ChevronLeft,
    Clock,
    UserRound,
    XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/modal";
import type {
    CustomerReservation,
    ReservationApplicant,
} from "../../_lib/matching.server";
import { confirmPartner } from "../../_actions/matching";
import { cancelReservation } from "@/app/(user)/reservation/_actions/matching";

function statusBadge(status: CustomerReservation["status"]) {
    switch (status) {
        case "MATCHING":
            return "bg-amber-100 text-amber-600 dark:bg-amber-500/15";
        case "CONFIRMED":
            return "bg-brand/10 text-brand";
        case "COMPLETED":
            return "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15";
        default:
            return "bg-muted text-muted-foreground";
    }
}

export function MatchingReservationView({
    reservation,
    applicants,
}: {
    reservation: CustomerReservation;
    applicants: ReservationApplicant[];
}) {
    const router = useRouter();
    const [selected, setSelected] = useState<ReservationApplicant | null>(null);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    const isMatching = reservation.status === "MATCHING";
    const confirmedPartner = applicants.find(
        (a) => a.partnerId === reservation.confirmedPartnerId,
    );

    const onConfirm = () => {
        if (!selected) return;
        const partnerId = selected.partnerId;
        startTransition(async () => {
            const res = await confirmPartner(reservation.id, partnerId);
            setSelected(null);
            if (res.ok) {
                toast.success("파트너를 확정했습니다.");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    const onCancel = () => {
        startTransition(async () => {
            const res = await cancelReservation(reservation.id);
            setCancelOpen(false);
            if (res.ok) {
                toast.success("예약을 취소했습니다.");
                router.push("/mypage");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    return (
        <div>
            {/* 헤더 */}
            <button
                type="button"
                onClick={() => router.push("/mypage")}
                className="text-foreground flex items-center gap-1.5 text-2xl font-extrabold"
            >
                <ChevronLeft className="size-6" />
                예약 상세
            </button>
            <p className="text-muted-foreground mt-2 text-sm">
                예약번호 {reservation.code}
            </p>

            {/* 예약 요약 */}
            <div className="border-border bg-background mt-6 rounded-2xl border p-6 md:p-7">
                <span
                    className={cn(
                        "inline-block rounded-full px-3 py-1 text-xs font-bold",
                        statusBadge(reservation.status),
                    )}
                >
                    {reservation.statusLabel}
                </span>
                <h2 className="text-foreground mt-4 flex items-center gap-2 text-xl font-extrabold">
                    <Building2 className="text-brand size-5 shrink-0" />
                    {reservation.hospital}
                </h2>
                <p className="text-muted-foreground mt-3 text-sm">
                    {reservation.dateLabel} {reservation.timeLabel} ·{" "}
                    {reservation.plan}
                </p>

                {isMatching && (
                    <div className="border-border mt-5 flex justify-end border-t pt-4">
                        <button
                            type="button"
                            onClick={() => setCancelOpen(true)}
                            disabled={pending}
                            className="text-destructive hover:bg-destructive/5 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors disabled:opacity-60"
                        >
                            <XCircle className="size-4" />
                            예약 취소
                        </button>
                    </div>
                )}
            </div>

            {/* 파트너 선택 / 확정 결과 */}
            <div className="mt-5">
                {isMatching ? (
                    <>
                        <h3 className="text-foreground text-lg font-bold">
                            지원한 파트너
                            <span className="text-brand ml-2">
                                {applicants.length}
                            </span>
                        </h3>
                        <p className="text-muted-foreground mt-1 text-sm">
                            지원한 파트너 중 한 분을 선택하면 예약이 확정됩니다.
                        </p>

                        {applicants.length === 0 ? (
                            <div className="border-border bg-background mt-4 flex flex-col items-center gap-3 rounded-2xl border px-6 py-14 text-center">
                                <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                                    <UserRound className="size-6" />
                                </span>
                                <p className="text-foreground font-bold">
                                    아직 지원한 파트너가 없어요
                                </p>
                                <p className="text-muted-foreground text-sm">
                                    파트너가 요청을 수락하면 여기에서 선택할 수
                                    있어요.
                                </p>
                            </div>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {applicants.map((a) => (
                                    <li
                                        key={a.partnerId}
                                        className="border-border bg-background flex items-center gap-4 rounded-2xl border p-5"
                                    >
                                        <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-full">
                                            <UserRound className="text-muted-foreground size-6" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-foreground font-bold">
                                                {a.name}
                                            </p>
                                            <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                                                <Clock className="size-3.5" />
                                                {a.appliedAtLabel} 지원
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelected(a)}
                                            disabled={pending}
                                            className="bg-brand text-brand-foreground hover:bg-brand/90 shrink-0 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
                                        >
                                            이 파트너로 선택
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                ) : (
                    <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h3 className="text-foreground text-lg font-bold">
                            확정 파트너
                        </h3>
                        {confirmedPartner ? (
                            <div className="mt-4 flex items-center gap-4">
                                <div className="bg-brand/10 text-brand flex size-12 shrink-0 items-center justify-center rounded-full">
                                    <CheckCircle2 className="size-6" />
                                </div>
                                <div>
                                    <p className="text-foreground font-bold">
                                        {confirmedPartner.name}
                                    </p>
                                    <p className="text-muted-foreground mt-0.5 text-sm">
                                        예약이 확정되었습니다.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-muted-foreground mt-3 text-sm">
                                {reservation.statusLabel} 상태입니다.
                            </p>
                        )}
                    </div>
                )}
            </div>

            <ConfirmModal
                open={selected !== null}
                onClose={() => setSelected(null)}
                onConfirm={onConfirm}
                title="이 파트너로 확정할까요?"
                cancelLabel="돌아가기"
                confirmLabel="파트너 확정"
                confirmDisabled={pending}
            >
                <p className="text-muted-foreground mt-3 text-left text-sm leading-relaxed">
                    <span className="text-foreground font-bold">
                        {selected?.name}
                    </span>{" "}
                    님으로 예약이 확정되며, 다른 지원 파트너는 자동으로
                    마감됩니다. 확정 후에는 변경할 수 없습니다.
                </p>
            </ConfirmModal>

            <ConfirmModal
                open={cancelOpen}
                onClose={() => setCancelOpen(false)}
                onConfirm={onCancel}
                title="예약을 취소할까요?"
                cancelLabel="돌아가기"
                confirmLabel="예약 취소"
                confirmDisabled={pending}
            >
                <p className="text-muted-foreground mt-3 text-left text-sm leading-relaxed">
                    취소하면 파트너에게 전달된 매칭 요청이 종료되며, 되돌릴 수
                    없습니다. 다시 이용하시려면 새로 예약해 주세요.
                </p>
            </ConfirmModal>
        </div>
    );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmModal } from "@/components/ui/modal";
import { cancelReservation } from "@/app/(user)/reservation/_actions/matching";
import { DIRECT_CANCEL_NOTICE } from "@/lib/direct-flow-copy";
import { isUrgentReservation } from "@/lib/urgent-reservation";
import type {
    DirectPhase,
    RefundReason,
} from "@/lib/direct-reservation-status";
import type { CustomerReservation } from "../../_lib/matching.server";
import { DirectReservationPanel } from "./direct-reservation-panel";

/** 신규 방식(#300) 예약 상세 — 배정 전 취소 액션을 연결한다. */
export function DirectReservationView({
    reservation,
    phase,
    refundReason,
}: {
    reservation: CustomerReservation;
    phase: DirectPhase;
    refundReason: RefundReason | null;
}) {
    const router = useRouter();
    const [cancelOpen, setCancelOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        const t = setTimeout(() => setNow(Date.now()), 0);
        return () => clearTimeout(t);
    }, []);

    const paid = phase === "WAITING";

    const onCancel = () => {
        startTransition(async () => {
            const res = await cancelReservation(reservation.id);
            setCancelOpen(false);
            if (res.ok) {
                toast.success(
                    paid
                        ? "예약을 취소했고 결제하신 금액이 전액 환불되었습니다."
                        : "예약을 취소했습니다.",
                );
            } else {
                // 예약은 닫혔어도 카드 취소가 끝나지 않았을 수 있다. 사유를 그대로 안내하고 상태를 다시 읽는다.
                toast.error(res.message);
            }
            // 취소·환불 진행 상태를 서버 값으로 다시 그린다(환불 완료로 단정하지 않는다).
            router.refresh();
        });
    };

    return (
        <>
            <DirectReservationPanel
                code={reservation.code}
                hospital={reservation.hospital}
                dateLabel={reservation.dateLabel}
                timeLabel={reservation.timeLabel}
                plan={reservation.plan}
                phase={phase}
                refundReason={refundReason}
                urgent={
                    now !== null &&
                    isUrgentReservation(
                        reservation.useDate,
                        reservation.startTime,
                        now,
                    )
                }
                pending={pending}
                resumeHref={`/reservation?pay=resume&rid=${reservation.id}`}
                onCancelClick={() => setCancelOpen(true)}
                onBack={() => router.push("/mypage")}
            />

            <ConfirmModal
                open={cancelOpen}
                onClose={() => setCancelOpen(false)}
                onConfirm={onCancel}
                title="예약을 취소할까요?"
                cancelLabel="돌아가기"
                confirmLabel="예약 취소"
                confirmDisabled={pending}
            >
                <p className="text-description-foreground mt-3 text-left text-sm leading-relaxed">
                    {paid
                        ? `${DIRECT_CANCEL_NOTICE} 취소하면 되돌릴 수 없으며, 카드 취소가 끝날 때까지 환불 진행 중으로 표시됩니다.`
                        : "결제 전 예약을 취소합니다. 되돌릴 수 없으며, 다시 이용하시려면 새로 예약해 주세요."}
                </p>
            </ConfirmModal>
        </>
    );
}

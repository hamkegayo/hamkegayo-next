import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import { createClient } from "@/utils/supabase/server";
import {
    getCustomerReservation,
    getDirectRefundState,
    getReservationApplicants,
} from "../../_lib/matching.server";
import { directPhase } from "@/lib/direct-reservation-status";
import { DirectReservationView } from "./direct-reservation-view";
import { getReservationDetail } from "../../_lib/detail.server";
import { MatchingReservationView } from "./matching-reservation-view";
import { ConsentPendingBanner } from "./consent-pending-banner";
import { ReservationDetailView } from "./reservation-detail-view";

function NotFound() {
    return (
        <div className="border-border bg-background flex flex-col items-center gap-3 rounded-2xl border px-6 py-16 text-center">
            <p className="text-foreground font-bold">예약을 찾을 수 없어요</p>
            <p className="text-muted-foreground text-sm">
                이미 삭제되었거나 접근 권한이 없는 예약입니다.
            </p>
            <Link
                href="/mypage"
                className="bg-brand text-brand-foreground hover:bg-brand/90 mt-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors"
            >
                예약 현황으로
            </Link>
        </div>
    );
}

export default async function ReservationDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const reservation = await getCustomerReservation(id);

    if (!reservation) {
        return <NotFound />;
    }

    // 처리방침 제10조 ①② — 이용자 본인 동의 대기 중이면 안내와 링크 재발급을 함께 보여준다 (#306).
    let consentPending = false;
    if (reservation.status === "MATCHING") {
        const supabase = await createClient();
        const { data: consent } = await supabase
            .from("reservations")
            .select("user_consent_status")
            .eq("id", id)
            .maybeSingle();
        consentPending = consent?.user_consent_status === "PENDING_USER";
    }

    // 신규 방식(#300): 결제 전·매칭 대기·취소/환불 진행은 전용 화면에서 보여준다.
    // 확정 이후와 환불 이력이 없는 취소는 기존 상세를 그대로 쓴다.
    if (reservation.matchingMode === "admin_direct") {
        const refund =
            reservation.status === "CANCELLED"
                ? await getDirectRefundState(id)
                : null;
        if (reservation.status === "MATCHING" || refund) {
            return (
                <>
                    <AutoRefresh />
                    <DirectReservationView
                        reservation={reservation}
                        notice={
                            consentPending ? (
                                <ConsentPendingBanner reservationId={id} />
                            ) : undefined
                        }
                        phase={directPhase({
                            status: reservation.status,
                            paidAt: reservation.paidAt,
                            refundStatus: refund?.status ?? null,
                        })}
                        refundReason={refund?.reason ?? null}
                    />
                </>
            );
        }
    }

    // 매칭 대기중: 지원 파트너 선택 화면
    if (reservation.status === "MATCHING") {
        const applicants = await getReservationApplicants(id);
        return (
            <MatchingReservationView
                reservation={reservation}
                applicants={applicants}
                notice={
                    consentPending ? (
                        <ConsentPendingBanner reservationId={id} />
                    ) : undefined
                }
            />
        );
    }

    // 확정/완료/취소: 리치 상세(실데이터)
    const detail = await getReservationDetail(id);
    if (!detail) {
        return <NotFound />;
    }
    return (
        <>
            <AutoRefresh />
            <ReservationDetailView r={detail} />
        </>
    );
}

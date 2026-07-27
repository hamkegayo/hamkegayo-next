import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import {
    getCustomerReservation,
    getReservationApplicants,
} from "../../_lib/matching.server";
import { getReservationDetail } from "../../_lib/detail.server";
import { MatchingReservationView } from "./matching-reservation-view";
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

    // 매칭 대기중: 지원 파트너 선택 화면
    if (reservation.status === "MATCHING") {
        const applicants = await getReservationApplicants(id);
        return (
            <MatchingReservationView
                reservation={reservation}
                applicants={applicants}
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

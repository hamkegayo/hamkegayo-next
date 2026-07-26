import {
    getCustomerReservation,
    getReservationApplicants,
} from "../../_lib/matching.server";
import { MatchingReservationView } from "./matching-reservation-view";
import { MockReservationDetail } from "./mock-reservation-detail";

export default async function ReservationDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const reservation = await getCustomerReservation(id);

    // 실제 예약이 아니면(데모 id 등) 기존 목업 상세로 폴백
    if (!reservation) {
        return <MockReservationDetail id={id} />;
    }

    const applicants = await getReservationApplicants(id);

    return (
        <MatchingReservationView
            reservation={reservation}
            applicants={applicants}
        />
    );
}

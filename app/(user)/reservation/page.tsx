import type { Metadata } from "next";

import { ReservationFlow } from "./_components/reservation-flow";

export const metadata: Metadata = {
    title: "예약하기 | 함께가요",
    description:
        "함께가요 병원 동행 예약 — 이용자 정보, 병원 정보, 서비스를 선택해 예약하세요.",
};

export default function ReservationPage() {
    return <ReservationFlow />;
}

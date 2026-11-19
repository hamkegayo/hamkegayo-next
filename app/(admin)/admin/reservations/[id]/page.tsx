import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminReservationForIncident } from "../../payments/_lib/payment-incidents.server";
import {
    getAssignablePartners,
    getDirectReservation,
} from "../_lib/direct-reservations.server";
import { DirectDetailView } from "./direct-detail-view";

export const metadata: Metadata = {
    title: "예약 상세",
    robots: { index: false, follow: false },
};

export default async function AdminReservationIncidentPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ incident?: string }>;
}) {
    const [{ id }, { incident = "" }] = await Promise.all([
        params,
        searchParams,
    ]);
    // 결제 사고 링크(?incident=)는 기존 열람 화면을 그대로 쓴다. 그 밖(알림 메일 링크 등)은 운영 상세다.
    if (!incident) {
        const { detail, loadError } = await getDirectReservation(id);
        if (loadError)
            return (
                <p role="alert" className="text-sm font-bold text-red-600">
                    예약을 불러오지 못했습니다. 관리자 권한·2단계 인증을
                    확인하고 다시 시도해 주세요.
                </p>
            );
        if (!detail) notFound();
        const partners = await getAssignablePartners(id);
        return <DirectDetailView detail={detail} partners={partners} />;
    }
    const reservation = await getAdminReservationForIncident(id, incident);
    if (!reservation) notFound();

    const rows = [
        ["예약번호", reservation.code],
        ["상태", reservation.status],
        ["이용일", `${reservation.useDate} ${reservation.arriveTime}`],
        ["이용자", reservation.patientName],
        ["이용자 연락처", reservation.patientPhone],
        ["예약자/보호자", reservation.guardianName],
        ["예약자 연락처", reservation.guardianPhone],
        ["병원", reservation.hospitalName],
        ["병원 주소", reservation.hospitalAddress],
    ];

    return (
        <div>
            <Link
                href="/admin/payments"
                className="text-brand text-sm font-bold hover:underline"
            >
                ← 결제 사고 관리
            </Link>
            <h1 className="text-foreground mt-4 text-2xl font-extrabold">
                관련 예약
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
                결제 사고 {incident} 처리 사유로 열람했으며 접속기록에
                남았습니다.
            </p>

            <dl className="border-border bg-background mt-6 divide-y rounded-2xl border px-5 md:px-6">
                {rows.map(([label, value]) => (
                    <div
                        key={label}
                        className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:gap-4"
                    >
                        <dt className="text-muted-foreground text-sm font-semibold">
                            {label}
                        </dt>
                        <dd className="text-foreground text-sm font-bold break-words">
                            {value || "-"}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

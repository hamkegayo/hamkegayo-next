import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminReservationForIncident } from "../../payments/_lib/payment-incidents.server";

export const metadata: Metadata = {
    title: "결제 사고 관련 예약",
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

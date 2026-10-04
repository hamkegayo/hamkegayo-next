import type { Metadata } from "next";
import Link from "next/link";

import { getAdminPaymentIncidents } from "./_lib/payment-incidents.server";
import { PaymentIncidentsView } from "./payment-incidents-view";

export const metadata: Metadata = {
    title: "결제 사고 관리",
    robots: { index: false, follow: false },
};

export default async function AdminPaymentsPage() {
    const { incidents, loadError } = await getAdminPaymentIncidents();

    return (
        <div>
            <Link
                href="/admin"
                className="text-brand text-sm font-bold hover:underline"
            >
                ← 관리자 홈
            </Link>
            <div className="mt-4">
                <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                    결제 사고 관리
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                    사고를 확인하고 고객 안내와 처리 상태를 기록합니다. PG
                    취소는 이번 단계에서 실행하지 않습니다.
                </p>
            </div>

            <p className="text-muted-foreground mt-1 text-xs">
                미처리·심각도 순으로 최대 100건과 사고별 최근 20개 이력을
                표시합니다.
            </p>

            <PaymentIncidentsView incidents={incidents} loadError={loadError} />
        </div>
    );
}

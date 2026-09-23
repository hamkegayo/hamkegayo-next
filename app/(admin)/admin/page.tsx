import type { Metadata } from "next";
import Link from "next/link";
import {
    AlertTriangle,
    ClipboardCheck,
    ScrollText,
    Wallet,
} from "lucide-react";

import { getAdminOverview } from "./_lib/admin.server";
import { LogoutButton } from "./logout-button";
import { kstDateTime } from "@/lib/format";

export const metadata: Metadata = {
    title: "관리자",
    robots: { index: false, follow: false },
};

const ACTION_LABEL: Record<string, string> = {
    RESERVATION_LIST: "예약 목록 조회",
    RESERVATION_READ: "예약 상세 열람",
    ADMIN_GRANT: "관리자 권한 부여",
    ADMIN_REVOKE: "관리자 권한 말소",
    ACCOUNT_STATUS: "계정 상태 변경",
    QUALIFICATION_REVIEW: "자격 심사",
    QUALIFICATION_FILE_READ: "자격 증빙 열람",
    SETTLEMENT_STATUS: "정산 상태 변경",
    SETTLEMENT_LIST: "정산 목록 조회",
    SETTLEMENT_APPROVE: "정산 승인",
    SETTLEMENT_HOLD: "정산 보류",
    SETTLEMENT_RELEASE: "정산 보류 해제",
    PAYMENT_INCIDENT_LIST: "결제 사고 목록 조회",
    PAYMENT_INCIDENT_STATUS: "결제 사고 상태 변경",
    PAYMENT_INCIDENT_CONTACT: "결제 사고 고객 안내 기록",
    PARTNER_ACCOUNT_ISSUE: "파트너 계정 발급",
};

function formatAt(iso: string): string {
    return kstDateTime(iso) ?? iso;
}

export default async function AdminHome() {
    const overview = await getAdminOverview();

    const cards = [
        {
            icon: ClipboardCheck,
            label: "자격 심사 대기",
            value: overview.pendingQualifications,
            href: "/admin/qualifications",
        },
        {
            icon: Wallet,
            label: "지급 대기 정산",
            value: overview.pendingSettlements,
            href: "/admin/settlements",
        },
        {
            icon: ScrollText,
            label: "예약",
            value: overview.reservationCount,
            href: null,
        },
        {
            icon: AlertTriangle,
            label: "미처리 결제 사고",
            value: overview.openPaymentIncidents,
            href: "/admin/payments",
            unavailable: overview.paymentIncidentSummaryUnavailable,
        },
    ];

    return (
        <div>
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                관리자
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
                {overview.name} 님으로 로그인했습니다. 2단계 인증 완료
                상태입니다.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map(
                    ({
                        icon: Icon,
                        label,
                        value,
                        href,
                        unavailable = false,
                    }) => {
                        const content = (
                            <>
                                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                                    <Icon className="size-4" />
                                    {label}
                                </p>
                                <p className="text-foreground mt-2 text-3xl font-extrabold">
                                    {unavailable
                                        ? "확인 필요"
                                        : value.toLocaleString()}
                                </p>
                                {label === "미처리 결제 사고" &&
                                    !unavailable &&
                                    overview.criticalPaymentIncidents > 0 && (
                                        <p className="mt-2 text-xs font-bold text-red-600">
                                            최상{" "}
                                            {overview.criticalPaymentIncidents}
                                            건
                                        </p>
                                    )}
                            </>
                        );

                        return href ? (
                            <Link
                                key={label}
                                href={href}
                                className="border-border bg-background hover:border-brand rounded-2xl border p-6 transition-colors"
                            >
                                {content}
                            </Link>
                        ) : (
                            <div
                                key={label}
                                className="border-border bg-background rounded-2xl border p-6"
                            >
                                {content}
                            </div>
                        );
                    },
                )}
            </div>

            <div className="border-border bg-background mt-5 rounded-2xl border p-6 md:p-7">
                <h2 className="text-foreground text-lg font-bold">
                    내 접속기록
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                    개인정보 열람 이력은 법령에 따라 2년간 보관됩니다.
                </p>

                {overview.recentAccess.length === 0 ? (
                    <div className="text-muted-foreground mt-4 rounded-xl border border-dashed px-6 py-10 text-center text-sm">
                        기록이 없습니다.
                    </div>
                ) : (
                    <ul className="divide-border mt-4 divide-y">
                        {overview.recentAccess.map((r) => (
                            <li
                                key={r.id}
                                className="flex items-center justify-between gap-4 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-foreground font-semibold">
                                        {ACTION_LABEL[r.action] ?? r.action}
                                    </p>
                                    {r.reason && (
                                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                                            {r.reason}
                                        </p>
                                    )}
                                </div>
                                <span className="text-muted-foreground shrink-0 text-xs">
                                    {formatAt(r.occurredAt)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Link
                href="/admin/accounts"
                className="text-brand mt-6 mr-5 inline-block font-semibold underline"
            >
                파트너 계정 발급
            </Link>
            <Link
                href="/admin/qualifications"
                className="text-brand mt-6 inline-block font-semibold underline"
            >
                파트너 자격 심사
            </Link>
            <div className="mt-6 inline-flex items-center gap-5">
                <Link
                    href="/admin/settlements"
                    className="text-brand inline-block font-semibold underline"
                >
                    정산 관리
                </Link>
                <LogoutButton />
            </div>
        </div>
    );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
    getAdminSettlements,
    type AdminSettlement,
} from "./_lib/settlements.server";
import { SettlementsTable } from "./settlements-table";

export const metadata: Metadata = {
    title: "정산 관리",
    robots: { index: false, follow: false },
};

const STATUSES = ["PENDING", "HOLD", "APPROVED", "PAID"] as const;

function date(value: string | undefined): string | null {
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export default async function AdminSettlementsPage({
    searchParams,
}: {
    searchParams: Promise<{
        from?: string;
        to?: string;
        partner?: string;
        status?: string;
    }>;
}) {
    const query = await searchParams;
    const status = STATUSES.includes(query.status as (typeof STATUSES)[number])
        ? (query.status as AdminSettlement["status"])
        : null;
    let result: Awaited<ReturnType<typeof getAdminSettlements>>;
    try {
        result = await getAdminSettlements({
            from: date(query.from),
            to: date(query.to),
            partner: query.partner || null,
            status,
        });
    } catch {
        return <p role="alert">정산 목록을 불러오지 못했습니다.</p>;
    }
    if (!result.allowed)
        return <p>정산 담당 권한과 2단계 인증이 필요합니다.</p>;

    const total = result.rows.reduce((sum, row) => sum + row.net, 0);
    const pending = result.rows.filter(
        (row) => row.status === "PENDING",
    ).length;
    const hold = result.rows.filter((row) => row.status === "HOLD").length;

    return (
        <div className="mx-auto w-full max-w-7xl">
            <Link
                href="/admin"
                className="text-brand text-sm font-bold underline"
            >
                ← 관리자 홈
            </Link>
            <h1 className="mt-4 text-2xl font-extrabold md:text-3xl">
                정산 관리
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
                결제와 정산계좌를 확인한 뒤 승인합니다. 승인은 지급 완료가
                아니며 이체 배치에 포함할 준비 상태입니다.
            </p>
            <Link
                href="/admin/settlements/batches"
                className="text-brand mt-3 inline-block text-sm font-bold underline"
            >
                이체 배치 목록 보기 →
            </Link>

            <form className="border-border bg-background mt-6 grid gap-4 rounded-xl border p-5 md:grid-cols-5">
                <label className="text-sm font-semibold">
                    이용일 시작
                    <input
                        type="date"
                        name="from"
                        defaultValue={query.from}
                        className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2 font-normal"
                    />
                </label>
                <label className="text-sm font-semibold">
                    이용일 종료
                    <input
                        type="date"
                        name="to"
                        defaultValue={query.to}
                        className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2 font-normal"
                    />
                </label>
                <label className="text-sm font-semibold">
                    파트너
                    <select
                        name="partner"
                        defaultValue={query.partner ?? ""}
                        className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2 font-normal"
                    >
                        <option value="">전체</option>
                        {result.partners.map((partner) => (
                            <option key={partner.id} value={partner.id}>
                                {partner.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-sm font-semibold">
                    상태
                    <select
                        name="status"
                        defaultValue={status ?? ""}
                        className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2 font-normal"
                    >
                        <option value="">전체</option>
                        <option value="PENDING">검토 대기</option>
                        <option value="HOLD">보류</option>
                        <option value="APPROVED">승인</option>
                        <option value="PAID">지급 완료</option>
                    </select>
                </label>
                <button className="bg-foreground text-background self-end rounded-lg px-4 py-2 font-bold">
                    조회
                </button>
            </form>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Summary
                    label="조회 지급액"
                    value={`${total.toLocaleString()}원`}
                />
                <Summary label="검토 대기" value={`${pending}건`} />
                <Summary label="보류" value={`${hold}건`} />
            </div>
            <SettlementsTable rows={result.rows} />
        </div>
    );
}

function Summary({ label, value }: { label: string; value: string }) {
    return (
        <div className="border-border bg-background rounded-xl border p-4">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="mt-1 text-xl font-extrabold">{value}</p>
        </div>
    );
}

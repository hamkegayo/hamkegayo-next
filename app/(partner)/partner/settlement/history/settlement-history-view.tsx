"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    type Settlement,
    type SettlementStatus,
    type SettlementSummary,
} from "../../../_lib/settlement";
import { SettlementDetailModal } from "../../../_components/settlement-detail-modal";

type Tab = "all" | SettlementStatus;

const PERIODS = ["오늘", "7일", "30일", "전체"] as const;

// 조회 기간은 UI 전용(정적 표시)
const PERIOD_FROM = "2025.05.01";
const PERIOD_TO = "2025.05.31";

function StatCol({
    label,
    value,
    sub,
    valueClass,
}: {
    label: string;
    value: string;
    sub?: string;
    valueClass?: string;
}) {
    return (
        <div>
            <p className="text-muted-foreground text-sm">{label}</p>
            <p
                className={cn(
                    "text-foreground mt-2 text-2xl font-extrabold",
                    valueClass,
                )}
            >
                {value}
            </p>
            {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
        </div>
    );
}

export function SettlementHistoryView({
    settlements,
    summary,
}: {
    settlements: Settlement[];
    summary: SettlementSummary;
}) {
    const s = summary;
    const [tab, setTab] = useState<Tab>("all");
    const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30일");
    const [selected, setSelected] = useState<Settlement | null>(null);

    const counts = {
        all: settlements.length,
        paid: settlements.filter((x) => x.status === "paid").length,
        pending: settlements.filter((x) => x.status === "pending").length,
    };

    const list =
        tab === "all"
            ? settlements
            : settlements.filter((x) => x.status === tab);

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-muted-foreground text-sm font-semibold">
                        <Link
                            href="/partner/settlement"
                            className="hover:text-foreground"
                        >
                            My/정산
                        </Link>{" "}
                        &gt; <span className="text-brand">최근 정산 내역</span>
                    </p>
                    <h1 className="text-foreground mt-2 text-2xl font-extrabold md:text-3xl">
                        최근 정산 내역
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        정산 상세 내역과 상태를 확인할 수 있습니다.
                    </p>
                </div>

                {/* 조회 기간 (UI 전용) */}
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-muted-foreground text-sm font-semibold">
                        조회 기간
                    </span>
                    <div className="border-border bg-background flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                        <CalendarDays className="text-muted-foreground size-4" />
                        <span className="text-foreground font-semibold">
                            {PERIOD_FROM}
                        </span>
                        <span className="text-muted-foreground">-</span>
                        <CalendarDays className="text-muted-foreground size-4" />
                        <span className="text-foreground font-semibold">
                            {PERIOD_TO}
                        </span>
                    </div>
                    <div className="border-border flex overflow-hidden rounded-lg border">
                        {PERIODS.map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setPeriod(p)}
                                className={cn(
                                    "px-3.5 py-2 text-sm font-bold transition-colors",
                                    period === p
                                        ? "bg-brand text-brand-foreground"
                                        : "bg-background text-muted-foreground hover:bg-muted",
                                )}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* 요약 */}
            <div className="border-border bg-background mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border p-6 md:grid-cols-3 md:p-7">
                <StatCol
                    label="총 정산 금액"
                    value={`${s.totalAmount.toLocaleString()}원`}
                    sub={`${s.serviceCount}건`}
                    valueClass="text-brand"
                />
                <StatCol label="정산 완료 건수" value={`${s.serviceCount}건`} />
                <StatCol label="진행 중 건수" value={`${s.pendingCount}건`} />
            </div>

            {/* 상태 탭 */}
            <div className="mt-5 flex flex-wrap gap-2">
                {(
                    [
                        { key: "all", label: "전체", count: counts.all },
                        { key: "paid", label: "정산 완료", count: counts.paid },
                        {
                            key: "pending",
                            label: "지급 예정",
                            count: counts.pending,
                        },
                    ] as const
                ).map(({ key, label, count }) => {
                    const active = tab === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={cn(
                                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-colors",
                                active
                                    ? "border-brand bg-brand/10 text-brand"
                                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                            )}
                        >
                            {label}
                            <span className="font-extrabold">{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* 테이블 */}
            <div className="border-border bg-background mt-4 overflow-hidden rounded-2xl border">
                {/* 데스크톱: 표 */}
                <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[860px] text-sm">
                        <thead>
                            <tr className="border-border text-muted-foreground border-b text-left">
                                <th className="px-6 py-4 font-semibold">
                                    정산 ID
                                </th>
                                <th className="px-4 py-4 font-semibold">
                                    서비스 일자
                                </th>
                                <th className="px-4 py-4 font-semibold">
                                    서비스 내용
                                </th>
                                <th className="px-4 py-4 text-right font-semibold">
                                    정산 금액
                                </th>
                                <th className="px-4 py-4 font-semibold">
                                    정산 상태
                                </th>
                                <th className="px-6 py-4 font-semibold">
                                    정산일
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-border divide-y">
                            {list.map((r) => {
                                const isPaid = r.status === "paid";
                                return (
                                    <tr
                                        key={r.id}
                                        onClick={() => setSelected(r)}
                                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                                    >
                                        <td className="text-foreground px-6 py-4 font-bold">
                                            {r.id}
                                        </td>
                                        <td className="text-foreground px-4 py-4">
                                            {r.serviceDate}
                                        </td>
                                        <td className="text-foreground px-4 py-4 font-semibold">
                                            {r.hospital} 동행 ({r.plan})
                                        </td>
                                        <td className="text-foreground px-4 py-4 text-right font-bold">
                                            {r.amount
                                                ? `${r.amount.toLocaleString()}원`
                                                : "-"}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span
                                                className={cn(
                                                    "rounded-full px-2.5 py-1 text-xs font-bold",
                                                    isPaid
                                                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
                                                        : "bg-brand/10 text-brand",
                                                )}
                                            >
                                                {isPaid
                                                    ? "지급 완료"
                                                    : "지급 예정"}
                                            </span>
                                        </td>
                                        <td className="text-foreground px-6 py-4">
                                            {r.settledDate ?? "-"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* 모바일: 카드 리스트 */}
                <ul className="divide-border divide-y md:hidden">
                    {list.map((r) => {
                        const isPaid = r.status === "paid";
                        return (
                            <li key={r.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelected(r)}
                                    className="hover:bg-muted/30 block w-full px-5 py-4 text-left transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-foreground font-bold">
                                                {r.hospital} 동행 ({r.plan})
                                            </p>
                                            <p className="text-muted-foreground mt-0.5 text-xs">
                                                {r.id} · {r.serviceDate}
                                            </p>
                                        </div>
                                        <span
                                            className={cn(
                                                "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                                                isPaid
                                                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
                                                    : "bg-brand/10 text-brand",
                                            )}
                                        >
                                            {isPaid ? "지급 완료" : "지급 예정"}
                                        </span>
                                    </div>
                                    <dl className="text-muted-foreground mt-3 space-y-1 text-xs">
                                        <div className="flex justify-between gap-3">
                                            <dt>정산 금액</dt>
                                            <dd className="text-brand font-bold">
                                                {r.amount
                                                    ? `${r.amount.toLocaleString()}원`
                                                    : "-"}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                            <dt>정산일</dt>
                                            <dd className="text-foreground">
                                                {r.settledDate ?? "-"}
                                            </dd>
                                        </div>
                                    </dl>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {/* 페이지네이션 (UI 전용) */}
                <div className="border-border flex items-center justify-center gap-2 border-t py-4">
                    <button
                        type="button"
                        className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-lg transition-colors"
                        aria-label="이전"
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                    <button
                        type="button"
                        className="bg-brand text-brand-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold"
                    >
                        1
                    </button>
                    <button
                        type="button"
                        className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-lg transition-colors"
                        aria-label="다음"
                    >
                        <ChevronRight className="size-4" />
                    </button>
                </div>
            </div>

            <SettlementDetailModal
                open={selected !== null}
                onClose={() => setSelected(null)}
                settlement={selected}
            />
        </div>
    );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { REPORT_ITEMS, type ReportStatus } from "../../_lib/reports";

function planBadge(plan: "Basic" | "Plus") {
    return plan === "Basic"
        ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15"
        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15";
}

export default function PartnerReports() {
    const [tab, setTab] = useState<ReportStatus>("pending");

    const pending = REPORT_ITEMS.filter((r) => r.status === "pending");
    const done = REPORT_ITEMS.filter((r) => r.status === "done");
    const list = tab === "pending" ? pending : done;

    return (
        <div>
            <p className="text-muted-foreground text-sm font-semibold">
                리포트 작성 &gt; <span className="text-brand">리포트 목록</span>
            </p>
            <h1 className="text-foreground mt-2 text-2xl font-extrabold md:text-3xl">
                리포트 목록
            </h1>
            <p className="text-muted-foreground mt-2">
                서비스가 완료된 동행입니다. 항목을 눌러 보호자 리포트를
                작성해주세요.
            </p>

            {/* 탭 */}
            <div className="mt-6 flex gap-2">
                {(
                    [
                        {
                            key: "pending",
                            label: "작성 대기",
                            count: pending.length,
                        },
                        { key: "done", label: "작성 완료", count: done.length },
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
                                    ? "border-brand bg-brand text-brand-foreground"
                                    : "border-border bg-background text-foreground hover:bg-muted",
                            )}
                        >
                            {label}
                            <span
                                className={cn(
                                    "flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs",
                                    active
                                        ? "text-brand-foreground bg-white/25"
                                        : "bg-muted text-muted-foreground",
                                )}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="border-border bg-background mt-5 overflow-hidden rounded-2xl border">
                {/* 헤더 (데스크톱) */}
                <div className="border-border text-muted-foreground hidden items-center gap-4 border-b px-6 py-3.5 text-sm font-semibold md:flex">
                    <span className="min-w-0 flex-1">병원 / 서비스</span>
                    <span className="w-44 shrink-0">이용자</span>
                    <span className="w-36 shrink-0">서비스 일자</span>
                    <span className="w-36 shrink-0">예약 번호</span>
                    <span className="w-28 shrink-0">상태</span>
                    <span className="w-6 shrink-0" />
                </div>

                <ul className="divide-border divide-y">
                    {list.map((r) => {
                        const isDone = r.status === "done";
                        const nameCls = isDone
                            ? "text-muted-foreground"
                            : "text-foreground";
                        const statusBadge = isDone ? (
                            <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold">
                                <span className="bg-muted-foreground size-1.5 rounded-full" />
                                작성 완료
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-600 dark:bg-amber-500/15">
                                <span className="size-1.5 rounded-full bg-amber-500" />
                                작성 대기
                            </span>
                        );
                        return (
                            <li key={r.id}>
                                <Link
                                    href={`/partner/reports/${r.id}`}
                                    className="hover:bg-muted/30 block transition-colors"
                                >
                                    {/* 데스크톱: 행 */}
                                    <div className="hidden items-center gap-4 px-6 py-5 md:flex">
                                        <div className="min-w-0 flex-1">
                                            <p
                                                className={cn(
                                                    "flex items-center gap-2 font-bold",
                                                    nameCls,
                                                )}
                                            >
                                                {r.hospital}
                                                <span
                                                    className={cn(
                                                        "inline-block rounded-md px-2 py-0.5 text-[11px] font-bold",
                                                        planBadge(r.plan),
                                                    )}
                                                >
                                                    {r.plan.toUpperCase()}
                                                </span>
                                            </p>
                                            <p className="text-muted-foreground mt-0.5 text-sm">
                                                {r.type}
                                            </p>
                                        </div>
                                        <div
                                            className={cn(
                                                "w-44 shrink-0 font-bold",
                                                nameCls,
                                            )}
                                        >
                                            {r.customerName} ({r.customerAge} /{" "}
                                            {r.customerGender})
                                        </div>
                                        <div
                                            className={cn(
                                                "w-36 shrink-0 font-bold",
                                                nameCls,
                                            )}
                                        >
                                            {r.serviceDate}
                                        </div>
                                        <div className="text-foreground w-36 shrink-0 font-bold">
                                            {r.code}
                                        </div>
                                        <div className="w-28 shrink-0">
                                            {statusBadge}
                                        </div>
                                        <div className="w-6 shrink-0 text-right">
                                            {!isDone && (
                                                <ChevronRight className="text-muted-foreground ml-auto size-5" />
                                            )}
                                        </div>
                                    </div>

                                    {/* 모바일: 카드 */}
                                    <div className="px-5 py-4 md:hidden">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p
                                                    className={cn(
                                                        "flex flex-wrap items-center gap-x-2 gap-y-1 font-bold",
                                                        nameCls,
                                                    )}
                                                >
                                                    {r.hospital}
                                                    <span
                                                        className={cn(
                                                            "inline-block rounded-md px-2 py-0.5 text-[11px] font-bold",
                                                            planBadge(r.plan),
                                                        )}
                                                    >
                                                        {r.plan.toUpperCase()}
                                                    </span>
                                                </p>
                                                <p className="text-muted-foreground mt-0.5 text-sm">
                                                    {r.type}
                                                </p>
                                            </div>
                                            <div className="shrink-0">
                                                {statusBadge}
                                            </div>
                                        </div>
                                        <dl className="text-muted-foreground mt-3 space-y-1 text-xs">
                                            <div className="flex justify-between gap-3">
                                                <dt>이용자</dt>
                                                <dd
                                                    className={cn(
                                                        "font-semibold",
                                                        nameCls,
                                                    )}
                                                >
                                                    {r.customerName} (
                                                    {r.customerAge} /{" "}
                                                    {r.customerGender})
                                                </dd>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <dt>서비스 일자</dt>
                                                <dd
                                                    className={cn(
                                                        "font-semibold",
                                                        nameCls,
                                                    )}
                                                >
                                                    {r.serviceDate}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <dt>예약 번호</dt>
                                                <dd className="text-foreground font-semibold">
                                                    {r.code}
                                                </dd>
                                            </div>
                                        </dl>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

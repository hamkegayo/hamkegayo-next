import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { MANAGEMENT_ITEMS, STATUS_META } from "../../_lib/management";

function planBadge(plan: "Basic" | "Plus") {
    return plan === "Basic"
        ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15"
        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15";
}

export default function PartnerManagement() {
    return (
        <div>
            <p className="text-muted-foreground text-sm font-semibold">
                진행관리 &gt;{" "}
                <span className="text-brand">수락한 서비스 목록</span>
            </p>
            <h1 className="text-foreground mt-2 text-2xl font-extrabold md:text-3xl">
                수락한 서비스 목록
            </h1>
            <p className="text-muted-foreground mt-2">
                진행 중인 동행을 확인하고, 항목을 눌러 서비스를 기록하세요.
            </p>

            <div className="border-border bg-background mt-6 overflow-hidden rounded-2xl border">
                {/* 헤더 */}
                <div className="border-border text-muted-foreground hidden items-center gap-4 border-b px-6 py-3.5 text-sm font-semibold md:flex">
                    <span className="min-w-0 flex-1">병원 / 서비스</span>
                    <span className="w-32 shrink-0">이용자</span>
                    <span className="w-44 shrink-0">예약 시간</span>
                    <span className="w-28 shrink-0 text-right">예상 정산</span>
                    <span className="w-24 shrink-0">상태</span>
                    <span className="w-5 shrink-0" />
                </div>

                <ul className="divide-border divide-y">
                    {MANAGEMENT_ITEMS.map((s) => {
                        const status = STATUS_META[s.status];
                        const dimmed = s.status === "completed";
                        return (
                            <li key={s.id}>
                                <Link
                                    href={`/partner/management/${s.id}`}
                                    className="hover:bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-5 transition-colors"
                                >
                                    <div className="order-1 min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                "flex items-center gap-2 font-bold",
                                                dimmed
                                                    ? "text-muted-foreground"
                                                    : "text-foreground",
                                            )}
                                        >
                                            {s.hospital}
                                            <span
                                                className={cn(
                                                    "inline-block rounded-md px-2 py-0.5 text-[11px] font-bold",
                                                    planBadge(s.plan),
                                                )}
                                            >
                                                {s.plan.toUpperCase()}
                                            </span>
                                        </p>
                                        <p className="text-muted-foreground mt-0.5 text-sm">
                                            {s.type}
                                        </p>
                                    </div>

                                    <div
                                        className={cn(
                                            "order-2 w-32 shrink-0 font-bold md:order-2",
                                            dimmed
                                                ? "text-muted-foreground"
                                                : "text-foreground",
                                        )}
                                    >
                                        {s.customerName} ({s.customerAge})
                                    </div>

                                    <div
                                        className={cn(
                                            "order-3 w-44 shrink-0 font-bold",
                                            dimmed
                                                ? "text-muted-foreground"
                                                : "text-foreground",
                                        )}
                                    >
                                        {s.dateLabel} {s.timeLabel}
                                    </div>

                                    <div className="text-brand order-4 w-28 shrink-0 text-right font-bold">
                                        {s.amount.toLocaleString()}원
                                    </div>

                                    <div className="order-5 w-24 shrink-0">
                                        <span
                                            className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                                                status.badge,
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "size-1.5 rounded-full",
                                                    status.dot,
                                                )}
                                            />
                                            {status.label}
                                        </span>
                                    </div>

                                    <ChevronRight className="text-muted-foreground order-6 size-5 shrink-0" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

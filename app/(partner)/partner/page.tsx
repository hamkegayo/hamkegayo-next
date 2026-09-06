import Link from "next/link";
import {
    CalendarDays,
    ChevronRight,
    FilePlus2,
    Inbox,
    Star,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { SERVICE_STATE_META } from "@/lib/reservation";
import { getPartnerName } from "../_lib/partner";
import { getPartnerHomeSummary } from "../_lib/home.server";

function planBadge(plan: "Basic" | "Plus") {
    return plan === "Basic"
        ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15"
        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15";
}

export default async function PartnerHome() {
    const [name, summary] = await Promise.all([
        getPartnerName(),
        getPartnerHomeSummary(),
    ]);

    const {
        newRequests,
        newRequestCount,
        todaySchedules,
        todayCount,
        pendingReportCount,
        avgRating,
        ratingCount,
    } = summary;

    const stats = [
        {
            label: "새 요청",
            value: `${newRequestCount}건`,
            sub: "확인 필요",
            tone: "text-emerald-600",
            chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
            icon: <FilePlus2 className="size-5" />,
        },
        {
            label: "오늘 일정",
            value: `${todayCount}건`,
            sub: "예정된 동행",
            tone: "text-blue-600",
            chip: "bg-blue-100 text-blue-600 dark:bg-blue-500/15",
            icon: <CalendarDays className="size-5" />,
        },
        {
            label: "누적 평점",
            value: avgRating === null ? "—" : avgRating.toFixed(1),
            sub: ratingCount === 0 ? "아직 없음" : `후기 ${ratingCount}건`,
            tone: "text-violet-600",
            chip: "bg-violet-100 text-violet-600 dark:bg-violet-500/15",
            icon: <Star className="size-5" />,
            isRating: true,
        },
    ];

    return (
        <div>
            {/* 인사 */}
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                {name}님, 오늘도 함께해요!
            </h1>
            <p className="text-muted-foreground mt-2">
                오늘 일정과 새로운 요청을 확인하고, 원활한 동행을 시작해보세요.
            </p>

            {/* 리포트 알림 배너 — 미작성 리포트가 있을 때만 노출 */}
            {pendingReportCount > 0 && (
                <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-500/10">
                    <p className="text-foreground flex items-center gap-3 font-bold">
                        <span className="flex size-7 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-white">
                            !
                        </span>
                        작성이 필요한 리포트가{" "}
                        <span className="text-amber-600">
                            {pendingReportCount}건
                        </span>{" "}
                        있습니다.
                    </p>
                    <Link
                        href="/partner/reports"
                        className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors"
                    >
                        리포트 작성하기
                        <ChevronRight className="size-4" />
                    </Link>
                </div>
            )}

            {/* 통계 3카드 */}
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {stats.map((s) => (
                    <div
                        key={s.label}
                        className="border-border bg-background rounded-2xl border p-6 text-center"
                    >
                        <p className={cn("text-sm font-bold", s.tone)}>
                            {s.label}
                        </p>
                        <div
                            className={cn(
                                "mx-auto mt-3 flex size-12 items-center justify-center rounded-xl",
                                s.chip,
                            )}
                        >
                            {s.icon}
                        </div>
                        <p className="text-foreground mt-3 text-2xl font-extrabold">
                            {s.value}
                        </p>
                        <p
                            className={cn(
                                "mt-1 text-xs",
                                s.isRating && ratingCount > 0
                                    ? "tracking-wide text-amber-400"
                                    : "text-muted-foreground",
                            )}
                        >
                            {s.isRating && avgRating !== null
                                ? "★".repeat(Math.round(avgRating))
                                : s.sub}
                        </p>
                    </div>
                ))}
            </div>

            {/* 오늘 일정 / 새로운 요청 */}
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                {/* 오늘 일정 */}
                <div className="border-border bg-background rounded-2xl border p-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-foreground text-lg font-bold">
                            오늘 일정
                        </h2>
                        <Link
                            href="/partner/management"
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-semibold"
                        >
                            전체 보기 <ChevronRight className="size-4" />
                        </Link>
                    </div>

                    {todaySchedules.length === 0 ? (
                        <div className="text-muted-foreground mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center text-sm">
                            <CalendarDays className="size-6" />
                            오늘 예정된 일정이 없어요.
                        </div>
                    ) : (
                        <>
                            <div className="mt-4 space-y-3">
                                {todaySchedules.map((s) => {
                                    const meta = SERVICE_STATE_META[s.state];
                                    return (
                                        <Link
                                            key={s.id}
                                            href={`/partner/management/${s.id}`}
                                            className="border-border hover:bg-muted/40 block rounded-xl border p-4 transition-colors"
                                        >
                                            {/* 데스크톱/태블릿: 행 */}
                                            <div className="hidden items-center gap-3 sm:flex">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-brand font-bold">
                                                        {s.timeLabel}
                                                    </p>
                                                    <p className="text-foreground mt-1 font-bold">
                                                        {s.hospital}
                                                    </p>
                                                    <p className="text-muted-foreground text-sm">
                                                        {s.type}
                                                    </p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <span
                                                        className={cn(
                                                            "inline-block rounded-md px-2 py-0.5 text-xs font-semibold",
                                                            meta.badge,
                                                        )}
                                                    >
                                                        {meta.label}
                                                    </span>
                                                    <p className="text-foreground mt-2 text-sm font-semibold">
                                                        {s.customerName}님
                                                    </p>
                                                    <p className="text-muted-foreground text-xs">
                                                        {s.plan}
                                                    </p>
                                                </div>
                                                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                                            </div>

                                            {/* 모바일: 카드 */}
                                            <div className="sm:hidden">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-brand font-bold">
                                                        {s.timeLabel}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            "inline-block rounded-md px-2 py-0.5 text-xs font-semibold",
                                                            meta.badge,
                                                        )}
                                                    >
                                                        {meta.label}
                                                    </span>
                                                </div>
                                                <p className="text-foreground mt-1.5 font-bold">
                                                    {s.hospital}
                                                </p>
                                                <p className="text-muted-foreground mt-0.5 text-sm">
                                                    {s.type} · {s.customerName}
                                                    님 · {s.plan}
                                                </p>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>

                            <p className="bg-muted/40 text-muted-foreground mt-4 rounded-lg px-4 py-3 text-center text-sm">
                                일정을 클릭하면 상세 정보를 확인할 수 있어요.
                            </p>
                        </>
                    )}
                </div>

                {/* 새로운 요청 */}
                <div className="border-border bg-background rounded-2xl border p-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-foreground text-lg font-bold">
                            새로운 요청
                        </h2>
                        <Link
                            href="/partner/requests"
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-semibold"
                        >
                            전체 보기 <ChevronRight className="size-4" />
                        </Link>
                    </div>

                    {newRequests.length === 0 ? (
                        <div className="text-muted-foreground mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center text-sm">
                            <Inbox className="size-6" />
                            수락 대기 중인 요청이 없어요.
                        </div>
                    ) : (
                        <>
                            <div className="divide-border mt-4 divide-y">
                                {newRequests.slice(0, 4).map((r) => (
                                    <Link
                                        key={r.id}
                                        href={`/partner/requests/${r.id}`}
                                        className="hover:bg-muted/30 block py-4 transition-colors"
                                    >
                                        {/* 데스크톱/태블릿: 행 */}
                                        <div className="hidden items-center gap-4 sm:flex">
                                            <div className="w-32 shrink-0">
                                                <p className="text-foreground font-bold whitespace-nowrap">
                                                    {r.dateLabel}
                                                </p>
                                                <p className="text-muted-foreground mt-0.5 text-sm whitespace-nowrap">
                                                    {r.timeLabel} · {r.duration}
                                                </p>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-foreground font-bold">
                                                    {r.hospital}
                                                </p>
                                                <p className="text-muted-foreground text-sm">
                                                    {r.type}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <span
                                                    className={cn(
                                                        "inline-block rounded-md px-2 py-0.5 text-xs font-semibold",
                                                        planBadge(r.plan),
                                                    )}
                                                >
                                                    {r.plan}
                                                </span>
                                                <p className="text-destructive mt-2 text-sm font-bold">
                                                    새 요청
                                                </p>
                                            </div>
                                            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                                        </div>

                                        {/* 모바일: 카드 */}
                                        <div className="sm:hidden">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-foreground font-bold">
                                                    {r.dateLabel} {r.timeLabel}{" "}
                                                    <span className="text-muted-foreground text-xs font-normal">
                                                        {r.duration}
                                                    </span>
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <span
                                                        className={cn(
                                                            "inline-block rounded-md px-2 py-0.5 text-xs font-semibold",
                                                            planBadge(r.plan),
                                                        )}
                                                    >
                                                        {r.plan}
                                                    </span>
                                                    <span className="text-destructive text-xs font-bold">
                                                        새 요청
                                                    </span>
                                                </span>
                                            </div>
                                            <p className="text-foreground mt-1.5 font-bold">
                                                {r.hospital}
                                            </p>
                                            <p className="text-muted-foreground mt-0.5 text-sm">
                                                {r.type}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>

                            <Link
                                href="/partner/requests"
                                className="bg-muted/40 text-foreground hover:bg-muted mt-4 flex items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-bold transition-colors"
                            >
                                요청 관리 바로가기{" "}
                                <ChevronRight className="size-4" />
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

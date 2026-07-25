import Link from "next/link";
import {
    CalendarDays,
    ChevronRight,
    FilePlus2,
    Megaphone,
    Star,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ComingSoonButton } from "@/app/(user)/_components/home/coming-soon-button";
import { getPartnerName } from "../_lib/partner";
import { NEW_REQUESTS, NOTICE, TODAY_SCHEDULES } from "../_lib/mock";

function planBadge(plan: "Basic" | "Plus") {
    return plan === "Basic"
        ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15"
        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15";
}

export default async function PartnerHome() {
    const name = await getPartnerName();

    return (
        <div>
            {/* 인사 */}
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                {name}님, 오늘도 함께해요! 👋
            </h1>
            <p className="text-muted-foreground mt-2">
                오늘 일정과 새로운 요청을 확인하고, 원활한 동행을 시작해보세요.
            </p>

            {/* 리포트 알림 배너 */}
            <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-500/10">
                <p className="text-foreground flex items-center gap-3 font-bold">
                    <span className="flex size-7 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-white">
                        !
                    </span>
                    작성이 필요한 리포트가{" "}
                    <span className="text-amber-600">1건</span> 있습니다.
                </p>
                <Link
                    href="/partner/reports"
                    className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors"
                >
                    리포트 작성하기
                    <ChevronRight className="size-4" />
                </Link>
            </div>

            {/* 통계 4카드 */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    {
                        label: "새 요청",
                        value: "3건",
                        sub: "확인 필요",
                        tone: "text-emerald-600",
                        chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
                        icon: <FilePlus2 className="size-5" />,
                    },
                    {
                        label: "오늘 일정",
                        value: "2건",
                        sub: "예정된 동행",
                        tone: "text-blue-600",
                        chip: "bg-blue-100 text-blue-600 dark:bg-blue-500/15",
                        icon: <CalendarDays className="size-5" />,
                    },
                    {
                        label: "오늘 정산 예정",
                        value: "86,000원",
                        sub: "3건",
                        tone: "text-amber-600",
                        chip: "bg-amber-100 text-amber-600 dark:bg-amber-500/15",
                        icon: <span className="text-lg font-extrabold">₩</span>,
                    },
                    {
                        label: "누적 평점",
                        value: "4.9",
                        sub: "★★★★★",
                        tone: "text-violet-600",
                        chip: "bg-violet-100 text-violet-600 dark:bg-violet-500/15",
                        icon: <Star className="size-5" />,
                    },
                ].map((s) => (
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
                                s.label === "누적 평점"
                                    ? "tracking-wide text-amber-400"
                                    : "text-muted-foreground",
                            )}
                        >
                            {s.sub}
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

                    <div className="mt-4 space-y-3">
                        {TODAY_SCHEDULES.map((s) => (
                            <Link
                                key={s.time}
                                href="/partner/management"
                                className="border-border hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-4 transition-colors"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-brand font-bold">
                                        {s.time}
                                    </p>
                                    <p className="text-foreground mt-1 font-bold">
                                        {s.hospital}
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                        {s.type}
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <span className="inline-block rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/15">
                                        {s.status}
                                    </span>
                                    <p className="text-foreground mt-2 text-sm font-semibold">
                                        {s.patient}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                        {s.plan}
                                    </p>
                                </div>
                                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                            </Link>
                        ))}
                    </div>

                    <p className="bg-muted/40 text-muted-foreground mt-4 rounded-lg px-4 py-3 text-center text-sm">
                        일정을 클릭하면 상세 정보를 확인할 수 있어요.
                    </p>
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

                    <div className="divide-border mt-4 divide-y">
                        {NEW_REQUESTS.map((r) => (
                            <Link
                                key={`${r.time}-${r.hospital}`}
                                href="/partner/requests"
                                className="hover:bg-muted/30 flex items-center gap-4 py-4 transition-colors"
                            >
                                <div className="shrink-0">
                                    <p className="text-foreground font-bold whitespace-nowrap">
                                        {r.time}
                                    </p>
                                    <p className="text-muted-foreground text-xs whitespace-nowrap">
                                        {r.duration}
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
                            </Link>
                        ))}
                    </div>

                    <Link
                        href="/partner/requests"
                        className="bg-muted/40 text-foreground hover:bg-muted mt-4 flex items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-bold transition-colors"
                    >
                        요청 관리 바로가기 <ChevronRight className="size-4" />
                    </Link>
                </div>
            </div>

            {/* 공지사항 */}
            <div className="border-border bg-background mt-5 flex items-center gap-3 rounded-2xl border px-5 py-4">
                <Megaphone className="text-brand size-5 shrink-0" />
                <span className="text-brand shrink-0 text-sm font-bold">
                    공지사항
                </span>
                <span className="text-foreground min-w-0 flex-1 truncate text-sm">
                    {NOTICE.title}
                </span>
                <span className="text-muted-foreground hidden shrink-0 text-sm sm:block">
                    {NOTICE.date}
                </span>
                <ComingSoonButton className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-sm font-semibold">
                    더보기
                    <ChevronRight className="size-4" />
                </ComingSoonButton>
            </div>
        </div>
    );
}

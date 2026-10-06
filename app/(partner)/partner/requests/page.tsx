import Link from "next/link";
import { ChevronRight, Inbox, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { getPartnerMatchingView } from "../../_lib/requests.server";
import { AutoRefresh } from "../../_components/auto-refresh";

function planBadge(plan: "Basic" | "Plus") {
    return plan === "Basic"
        ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15"
        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15";
}

export default async function PartnerRequests({
    searchParams,
}: {
    searchParams: Promise<{ mine?: string }>;
}) {
    const { items, activitySet } = await getPartnerMatchingView();
    // #226 — 내 조건에 맞는 요청만 보기. 기본은 전체(맞는 요청이 위).
    const mineOnly = activitySet && (await searchParams).mine === "1";
    const matchedCount = items.filter((r) => r.match?.matched).length;
    const requests = mineOnly ? items.filter((r) => r.match?.matched) : items;
    const count = items.length;

    return (
        <div>
            {/* 새 요청이 들어오면 새로고침 없이 목록·사이드바 뱃지가 함께 갱신된다 */}
            <AutoRefresh />

            <p className="text-muted-foreground text-sm font-semibold">
                서비스 요청 &gt;{" "}
                <span className="text-brand">수락 대기 목록</span>
            </p>
            <h1 className="text-foreground mt-2 flex items-center gap-2 text-2xl font-extrabold md:text-3xl">
                수락 대기 목록
                {count > 0 && (
                    <span className="bg-destructive flex size-6 items-center justify-center rounded-full text-sm font-bold text-white">
                        {count}
                    </span>
                )}
            </h1>
            <p className="text-muted-foreground mt-2">
                아직 수락하지 않은 요청입니다. 항목을 누르면 상세 내용을 확인할
                수 있어요.
            </p>

            {activitySet ? (
                count > 0 && (
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                        <Link
                            href="/partner/requests"
                            aria-current={!mineOnly ? "page" : undefined}
                            className={cn(
                                "rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors",
                                !mineOnly
                                    ? "border-brand bg-brand text-brand-foreground"
                                    : "border-border bg-background text-foreground hover:bg-muted",
                            )}
                        >
                            전체 {count}
                        </Link>
                        <Link
                            href="/partner/requests?mine=1"
                            aria-current={mineOnly ? "page" : undefined}
                            className={cn(
                                "rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors",
                                mineOnly
                                    ? "border-brand bg-brand text-brand-foreground"
                                    : "border-border bg-background text-foreground hover:bg-muted",
                            )}
                        >
                            내 조건에 맞음 {matchedCount}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                            조건에 맞는 요청이 위에 표시됩니다.
                        </span>
                    </div>
                )
            ) : (
                <p className="bg-muted text-muted-foreground mt-5 rounded-xl px-4 py-3 text-sm break-keep">
                    <Link
                        href="/partner/profile"
                        className="text-brand font-bold underline"
                    >
                        My 프로필
                    </Link>
                    에서 활동 지역·시간 등을 설정하면 조건에 맞는 요청을 먼저
                    보여 드려요.
                </p>
            )}

            {mineOnly && requests.length === 0 && count > 0 ? (
                <div className="border-border bg-background mt-6 rounded-2xl border px-6 py-12 text-center">
                    <p className="text-foreground font-bold">
                        내 조건에 맞는 요청이 아직 없어요
                    </p>
                    <p className="text-muted-foreground mt-2 text-sm">
                        <Link
                            href="/partner/requests"
                            className="text-brand font-bold underline"
                        >
                            전체 요청
                        </Link>
                        에서 다른 요청을 확인할 수 있어요.
                    </p>
                </div>
            ) : count === 0 ? (
                <div className="border-border bg-background mt-6 flex flex-col items-center gap-3 rounded-2xl border px-6 py-16 text-center">
                    <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                        <Inbox className="size-6" />
                    </span>
                    <p className="text-foreground font-bold">
                        새로운 요청이 없어요
                    </p>
                    <p className="text-muted-foreground text-sm">
                        수락 대기 중인 서비스 요청이 들어오면 여기에 표시됩니다.
                    </p>
                </div>
            ) : (
                <div className="divide-border border-border bg-background mt-6 divide-y overflow-hidden rounded-2xl border">
                    {requests.map((r) => (
                        <Link
                            key={r.id}
                            href={`/partner/requests/${r.id}`}
                            className="hover:bg-muted/30 flex items-center gap-4 px-6 py-5 transition-colors"
                        >
                            <div className="border-border w-36 shrink-0 border-r pr-4">
                                <p className="text-foreground font-bold whitespace-nowrap">
                                    {r.dateLabel}
                                </p>
                                <p className="text-muted-foreground mt-0.5 text-sm whitespace-nowrap">
                                    {r.timeLabel} · {r.duration}
                                </p>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-foreground truncate font-bold">
                                    {r.hospital}
                                </p>
                                <p className="text-muted-foreground mt-0.5 truncate text-sm">
                                    {r.type}
                                </p>
                                {r.match && r.match.hits.length > 0 && (
                                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                                        {r.match.matched && (
                                            <span className="bg-brand text-brand-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold">
                                                <Sparkles className="size-3" />
                                                내 조건에 맞음
                                            </span>
                                        )}
                                        {/* 일부만 맞으면 맞는 요청으로 오해하지 않게 회색으로 구분한다 */}
                                        <span
                                            className={cn(
                                                "font-semibold",
                                                r.match.matched
                                                    ? "text-brand"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {!r.match.matched && "일부 일치: "}
                                            {r.match.hits.join(" · ")}
                                        </span>
                                    </p>
                                )}
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
                                    미수락
                                </p>
                            </div>
                            <ChevronRight className="text-muted-foreground size-5 shrink-0" />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

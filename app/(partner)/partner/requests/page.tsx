import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { getPartnerMatchingRequests } from "../../_lib/requests.server";
import { AutoRefresh } from "../../_components/auto-refresh";

function planBadge(plan: "Basic" | "Plus") {
    return plan === "Basic"
        ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15"
        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15";
}

export default async function PartnerRequests() {
    const requests = await getPartnerMatchingRequests();
    const count = requests.length;

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

            {count === 0 ? (
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

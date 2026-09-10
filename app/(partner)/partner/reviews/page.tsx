import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { getMyPartnerReviews } from "@/app/(partner)/_lib/reviews.server";

export const metadata: Metadata = {
    title: "후기 확인",
};

/** 별 5개 — 채워진 개수만큼 강조 */
function Stars({ value, className }: { value: number; className?: string }) {
    return (
        <span className={cn("flex items-center gap-0.5", className)}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    aria-hidden
                    className={cn(
                        "size-4",
                        n <= value
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30",
                    )}
                />
            ))}
            <span className="sr-only">5점 만점에 {value}점</span>
        </span>
    );
}

export default async function PartnerReviewsPage() {
    const { reviews, average, distribution } = await getMyPartnerReviews();
    const total = reviews.length;

    return (
        <div>
            <Link
                href="/partner/settlement"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-semibold transition-colors"
            >
                <ChevronLeft className="size-4" />
                정산 관리
            </Link>

            <h1 className="text-foreground mt-3 text-2xl font-extrabold md:text-3xl">
                후기 확인
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                이용자가 남긴 후기입니다. 작성자는 마스킹되어 표시됩니다.
            </p>

            {total === 0 ? (
                <div className="border-border bg-background mt-6 rounded-2xl border p-10 text-center">
                    <p className="text-foreground font-bold">
                        아직 받은 후기가 없습니다.
                    </p>
                    <p className="text-muted-foreground mt-1.5 text-sm">
                        서비스가 완료되고 이용자가 후기를 작성하면 여기에
                        표시됩니다.
                    </p>
                </div>
            ) : (
                <>
                    {/* 요약 */}
                    <section className="border-border bg-background mt-6 grid gap-6 rounded-2xl border p-6 sm:grid-cols-[auto_1fr] sm:gap-10">
                        <div className="flex flex-col items-center justify-center">
                            <p className="text-4xl font-extrabold text-amber-500 tabular-nums">
                                {average?.toFixed(1)}
                            </p>
                            <Stars
                                value={Math.round(average ?? 0)}
                                className="mt-2"
                            />
                            <p className="text-muted-foreground mt-2 text-xs">
                                후기 {total}건
                            </p>
                        </div>

                        <ul className="flex flex-col justify-center gap-1.5">
                            {[5, 4, 3, 2, 1].map((score) => {
                                const count = distribution[score - 1];
                                const pct = total
                                    ? Math.round((count / total) * 100)
                                    : 0;
                                return (
                                    <li
                                        key={score}
                                        className="flex items-center gap-3 text-sm"
                                    >
                                        <span className="text-muted-foreground w-8 shrink-0 tabular-nums">
                                            {score}점
                                        </span>
                                        <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                                            <span
                                                className="block h-full rounded-full bg-amber-400"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </span>
                                        <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">
                                            {count}건
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    {/* 목록 */}
                    <ul className="mt-5 space-y-4">
                        {reviews.map((r) => (
                            <li
                                key={r.id}
                                className="border-border bg-background rounded-2xl border p-6"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Stars value={r.rating} />
                                    <p className="text-muted-foreground text-xs tabular-nums">
                                        {r.author} · {r.dateLabel}
                                    </p>
                                </div>

                                <h2 className="text-foreground mt-3 font-bold">
                                    {r.title}
                                </h2>
                                <p className="text-muted-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                                    {r.content}
                                </p>

                                {r.reply && (
                                    <div className="bg-muted/40 mt-4 rounded-xl p-4">
                                        <p className="text-foreground text-xs font-bold">
                                            운영팀 답변
                                        </p>
                                        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
                                            {r.reply}
                                        </p>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {/*
              매뉴얼 8장은 후기를 "업무 판단에 사용하지 않는다" 고 정한다.
              준비중이라 그렇게 적힌 것이지만, 후기가 수락·거절 판단의 근거가
              아니라는 원칙 자체는 그대로다. 화면에도 남겨 둔다.
            */}
            <p className="text-muted-foreground mt-8 text-xs leading-relaxed">
                후기는 서비스 품질 참고용입니다. 업무 수락·거절 판단은 예약
                화면의 조건과 매뉴얼 기준에 따릅니다.
            </p>
        </div>
    );
}

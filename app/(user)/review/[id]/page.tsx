import Link from "next/link";
import { ChevronLeft, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { getReviewWithAdjacent, type ReviewPlan } from "../_lib/reviews.server";
import { Stars } from "../_components/stars";

function planBadge(plan: ReviewPlan) {
    return plan === "Plus"
        ? "bg-brand text-brand-foreground"
        : "bg-muted text-muted-foreground";
}

export default async function ReviewDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const { review, prev, next } = await getReviewWithAdjacent(id);

    if (!review) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-16 text-center">
                <p className="text-muted-foreground">
                    후기를 찾을 수 없습니다.
                </p>
                <Link
                    href="/review"
                    className="text-brand mt-4 inline-block text-sm font-bold"
                >
                    목록으로
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl px-4 py-10 md:py-14">
            {/* 헤더 */}
            <div className="text-center">
                <h1 className="text-foreground text-3xl font-extrabold">
                    이용 후기
                </h1>
                <p className="text-muted-foreground mt-3">
                    함께가요와 동행한 가족들이 직접 남겨주신 생생한
                    이야기입니다.
                </p>
            </div>

            <Link
                href="/review"
                className="text-muted-foreground hover:text-foreground mt-8 inline-flex items-center gap-1 text-sm font-semibold transition-colors"
            >
                <ChevronLeft className="size-4" />
                목록으로
            </Link>

            <article className="border-border bg-background mt-4 rounded-2xl border p-6 md:p-8">
                {/* 상단: 배지 + 별점 */}
                <div className="flex items-center gap-3">
                    <span
                        className={cn(
                            "inline-block rounded-full px-2.5 py-1 text-[11px] font-bold",
                            planBadge(review.plan),
                        )}
                    >
                        {review.plan.toUpperCase()}
                    </span>
                    <Stars rating={review.rating} />
                    <span className="text-foreground font-extrabold">
                        {review.rating.toFixed(1)}
                    </span>
                </div>

                <h2 className="text-foreground mt-4 text-2xl font-extrabold">
                    {review.title}
                </h2>
                <div className="mt-3 flex items-center gap-3 text-sm">
                    <span className="bg-brand/10 text-brand flex size-9 items-center justify-center rounded-full font-bold">
                        {review.author.charAt(0)}
                    </span>
                    <span className="text-foreground font-bold">
                        {review.author}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{review.date}</span>
                </div>

                <div className="bg-border my-6 h-px" />

                <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {review.content}
                </p>

                {/* 운영팀 답변 */}
                {review.reply && (
                    <div className="bg-brand/5 mt-6 rounded-xl p-5">
                        <p className="text-brand flex items-center gap-1.5 text-sm font-bold">
                            <MessageSquare className="size-4" />
                            함께가요 운영팀 답변
                        </p>
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                            {review.reply}
                        </p>
                    </div>
                )}

                <div className="bg-border my-6 h-px" />

                {/* 이전 / 다음 후기 */}
                <div className="grid gap-4 sm:grid-cols-2">
                    {prev ? (
                        <Link
                            href={`/review/${prev.id}`}
                            className="border-border hover:bg-muted/30 rounded-xl border p-4 transition-colors"
                        >
                            <p className="text-muted-foreground text-xs font-semibold">
                                ◀ 이전 후기
                            </p>
                            <p className="text-foreground mt-1 truncate font-bold">
                                {prev.title}
                            </p>
                        </Link>
                    ) : (
                        <div />
                    )}
                    {next ? (
                        <Link
                            href={`/review/${next.id}`}
                            className="border-border hover:bg-muted/30 rounded-xl border p-4 text-right transition-colors"
                        >
                            <p className="text-muted-foreground text-xs font-semibold">
                                다음 후기 ▶
                            </p>
                            <p className="text-foreground mt-1 truncate font-bold">
                                {next.title}
                            </p>
                        </Link>
                    ) : (
                        <div />
                    )}
                </div>
            </article>
        </div>
    );
}

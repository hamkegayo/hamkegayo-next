"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

import { cn } from "@/lib/utils";

import Link from "next/link";
import type { ReviewView } from "@/app/(user)/review/_lib/reviews.server";

const AUTO_MS = 5000;

// 화면 폭에 따른 한 번에 보이는 카드 수 (SSR 기본 3)
function subscribe(cb: () => void) {
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
}
function getPerView() {
    const w = window.innerWidth;
    return w >= 1024 ? 3 : w >= 640 ? 2 : 1;
}

function Stars({ rating }: { rating: number }) {
    return (
        <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
                <Star
                    key={i}
                    className={cn(
                        "size-4",
                        i < rating
                            ? "fill-amber-400 text-amber-400"
                            : "fill-muted text-muted",
                    )}
                />
            ))}
        </div>
    );
}

function ReviewCard({ review }: { review: ReviewView }) {
    return (
        <Link
            href={`/review/${review.id}`}
            className="border-border bg-background flex h-full flex-col rounded-2xl border p-6"
        >
            <Stars rating={review.rating} />
            <p className="text-foreground mt-3 line-clamp-5 flex-1 text-sm leading-relaxed">
                “{review.content}”
            </p>
            <div className="mt-4 flex items-center gap-3">
                <span className="bg-brand/10 text-brand flex size-9 items-center justify-center rounded-full text-sm font-bold">
                    {review.author.charAt(0)}
                </span>
                <div>
                    <p className="text-foreground text-sm font-bold">
                        {review.author}
                    </p>
                    <p className="text-muted-foreground text-xs">
                        {review.plan} · {review.date}
                    </p>
                </div>
            </div>
        </Link>
    );
}

export function ReviewsCarousel({ reviews }: { reviews: ReviewView[] }) {
    // SSR 안전한 perView 구독 (setState-in-effect 회피)
    const perView = useSyncExternalStore(subscribe, getPerView, () => 3);
    const [index, setIndex] = useState(0);

    const maxIndex = Math.max(0, reviews.length - perView);
    const current = Math.min(index, maxIndex);

    const go = (next: number) => {
        if (next < 0) setIndex(maxIndex);
        else if (next > maxIndex) setIndex(0);
        else setIndex(next);
    };

    // 5초마다 오른쪽으로 자동 넘김
    useEffect(() => {
        const timer = setInterval(() => {
            setIndex((i) => (i >= maxIndex ? 0 : i + 1));
        }, AUTO_MS);
        return () => clearInterval(timer);
    }, [maxIndex]);

    return (
        <div className="mt-8">
            <div className="flex items-center gap-2 md:gap-4">
                {/* 이전 */}
                <button
                    type="button"
                    onClick={() => go(current - 1)}
                    aria-label="이전 후기"
                    className="border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors"
                >
                    <ChevronLeft className="size-5" />
                </button>

                {/* 뷰포트 */}
                <div className="min-w-0 flex-1 overflow-hidden">
                    <div
                        className="flex transition-transform duration-500 ease-out"
                        style={{
                            transform: `translateX(-${current * (100 / perView)}%)`,
                        }}
                    >
                        {reviews.map((review) => (
                            <div
                                key={review.id}
                                className="shrink-0 px-2"
                                style={{ width: `${100 / perView}%` }}
                            >
                                <ReviewCard review={review} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* 다음 */}
                <button
                    type="button"
                    onClick={() => go(current + 1)}
                    aria-label="다음 후기"
                    className="border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors"
                >
                    <ChevronRight className="size-5" />
                </button>
            </div>

            {/* 점 (페이지네이션) */}
            <div className="mt-6 flex justify-center gap-2">
                {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => go(i)}
                        aria-label={`${i + 1}번째로 이동`}
                        className={cn(
                            "h-2 rounded-full transition-all",
                            i === current
                                ? "bg-brand w-5"
                                : "bg-border hover:bg-muted-foreground/40 w-2",
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

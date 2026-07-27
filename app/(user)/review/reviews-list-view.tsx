"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ReviewPlan, ReviewView } from "./_lib/reviews.server";
import { Stars } from "./_components/stars";

type Sort = "latest" | "rating";

function planBadge(plan: ReviewPlan) {
    return plan === "Plus"
        ? "bg-brand text-brand-foreground"
        : "bg-muted text-muted-foreground";
}

// 데스크톱 그리드 컬럼(번호 / 서비스 / 제목 / 작성자 / 별점 / 작성일)
const COLS = "md:grid-cols-[4rem_6rem_1fr_8rem_9rem_8rem]";

export function ReviewsListView({ reviews }: { reviews: ReviewView[] }) {
    const [sort, setSort] = useState<Sort>("latest");

    const list =
        sort === "latest"
            ? reviews
            : [...reviews].sort((a, b) => b.rating - a.rating);

    return (
        <div className="mx-auto max-w-7xl px-4 py-10 md:py-14">
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

            {/* 정렬 + 작성 */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
                <p className="text-foreground text-xl font-extrabold">
                    전체 <span className="text-brand">{reviews.length}건</span>
                </p>
                <div className="flex items-center gap-3">
                    <div className="border-border flex overflow-hidden rounded-full border">
                        {(
                            [
                                { key: "latest", label: "최신순" },
                                { key: "rating", label: "별점순" },
                            ] as const
                        ).map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSort(key)}
                                className={cn(
                                    "px-4 py-2 text-sm font-bold transition-colors",
                                    sort === key
                                        ? "bg-brand/10 text-brand"
                                        : "bg-background text-muted-foreground hover:bg-muted",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <Link
                        href="/review/write"
                        className="bg-brand text-brand-foreground hover:bg-brand/90 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold transition-colors"
                    >
                        <Plus className="size-4" />
                        후기 작성하기
                    </Link>
                </div>
            </div>

            {/* 목록 */}
            <div className="border-border bg-background mt-4 overflow-hidden rounded-2xl border">
                {/* 헤더 행 (데스크톱 전용) */}
                <div
                    className={cn(
                        "border-border bg-muted/40 text-muted-foreground hidden gap-4 border-b px-6 py-4 text-sm font-semibold md:grid",
                        COLS,
                    )}
                >
                    <span>번호</span>
                    <span>서비스</span>
                    <span>제목</span>
                    <span>작성자</span>
                    <span>별점</span>
                    <span>작성일</span>
                </div>

                {list.length === 0 && (
                    <div className="text-muted-foreground px-6 py-16 text-center text-sm">
                        아직 등록된 후기가 없어요.
                    </div>
                )}
                <ul className="divide-border divide-y">
                    {list.map((r, i) => (
                        <li key={r.id}>
                            <Link
                                href={`/review/${r.id}`}
                                className={cn(
                                    "hover:bg-muted/30 block px-6 py-4 transition-colors md:grid md:items-center md:gap-4",
                                    COLS,
                                )}
                            >
                                {/* 모바일 상단: 배지 + 별점 */}
                                <div className="flex items-center gap-2 md:hidden">
                                    <span
                                        className={cn(
                                            "inline-block rounded-full px-2.5 py-1 text-[11px] font-bold",
                                            planBadge(r.plan),
                                        )}
                                    >
                                        {r.plan.toUpperCase()}
                                    </span>
                                    <Stars rating={r.rating} />
                                </div>

                                {/* 번호 (데스크톱) */}
                                <span className="text-muted-foreground hidden md:block">
                                    {i + 1}
                                </span>
                                {/* 서비스 (데스크톱) */}
                                <span className="hidden md:block">
                                    <span
                                        className={cn(
                                            "inline-block rounded-full px-2.5 py-1 text-[11px] font-bold",
                                            planBadge(r.plan),
                                        )}
                                    >
                                        {r.plan.toUpperCase()}
                                    </span>
                                </span>

                                {/* 제목 */}
                                <p className="text-foreground mt-2 font-bold md:mt-0 md:truncate">
                                    {r.title}
                                </p>

                                {/* 작성자 (데스크톱) */}
                                <span className="text-foreground hidden md:block">
                                    {r.author}
                                </span>
                                {/* 별점 (데스크톱) */}
                                <span className="hidden md:block">
                                    <Stars rating={r.rating} />
                                </span>
                                {/* 작성일 (데스크톱) */}
                                <span className="text-muted-foreground hidden md:block">
                                    {r.date}
                                </span>

                                {/* 모바일 하단 메타 */}
                                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-xs md:hidden">
                                    <span>{r.author}</span>
                                    <span>·</span>
                                    <span>{r.date}</span>
                                    <span>·</span>
                                    <span>#{i + 1}</span>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

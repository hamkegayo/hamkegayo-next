"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    House,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { ReviewableService } from "../_lib/reviews.server";
import { createReview } from "../_actions/reviews";
import { StarInput } from "../_components/stars";

type Step = "select" | "form" | "done";

function ServiceCard({
    service,
    active,
    onClick,
}: {
    service: ReviewableService;
    active?: boolean;
    onClick?: () => void;
}) {
    const inner = (
        <div className="flex items-center gap-4">
            <span
                className={cn(
                    "text-brand flex size-12 shrink-0 flex-col items-center justify-center rounded-xl",
                    service.plan === "Plus"
                        ? "bg-emerald-100 dark:bg-emerald-500/15"
                        : "bg-brand/10",
                )}
            >
                <House className="size-5" />
                <span className="text-[10px] font-bold">{service.plan}</span>
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-foreground font-bold">{service.hospital}</p>
                <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                    <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" />
                        {service.dateLabel}
                    </span>
                </p>
            </div>
            {onClick && (
                <ChevronRight className="text-muted-foreground size-5 shrink-0" />
            )}
        </div>
    );

    if (!onClick) {
        return (
            <div className="border-brand/40 bg-brand/5 rounded-2xl border p-4">
                {inner}
            </div>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full rounded-2xl border p-4 text-left transition-colors",
                active
                    ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10"
                    : "border-border bg-brand/5 hover:bg-brand/10",
            )}
        >
            {inner}
        </button>
    );
}

export function ReviewWriteView({
    services,
}: {
    services: ReviewableService[];
}) {
    const [step, setStep] = useState<Step>("select");
    const [selected, setSelected] = useState<ReviewableService | null>(null);

    const [rating, setRating] = useState(0);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [pending, startTransition] = useTransition();

    const canSubmit =
        rating > 0 && title.trim().length >= 2 && content.trim().length > 0;

    const onSubmit = () => {
        if (!selected || !canSubmit) return;
        startTransition(async () => {
            const res = await createReview(selected.serviceId, {
                rating,
                title,
                content,
            });
            if (res.ok) setStep("done");
            else toast.error(res.message);
        });
    };

    /* ---------- 서비스 선택 ---------- */
    if (step === "select") {
        return (
            <div className="mx-auto max-w-7xl px-4 py-10 md:py-14">
                <div className="text-center">
                    <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                        어떤 병원 동행 서비스에 대한 후기를 작성하시겠어요?
                    </h1>
                    <p className="text-muted-foreground mt-3">
                        이용한 서비스를 선택해야 후기 작성이 가능합니다.
                    </p>
                </div>

                <div className="mt-8 space-y-3">
                    {services.length === 0 ? (
                        <div className="border-border bg-background text-muted-foreground rounded-2xl border px-6 py-14 text-center text-sm">
                            후기를 작성할 수 있는 완료된 서비스가 없어요.
                        </div>
                    ) : (
                        services.map((s) => (
                            <ServiceCard
                                key={s.serviceId}
                                service={s}
                                active={selected?.serviceId === s.serviceId}
                                onClick={() => {
                                    setSelected(s);
                                    setStep("form");
                                }}
                            />
                        ))
                    )}
                </div>
            </div>
        );
    }

    /* ---------- 등록 완료 ---------- */
    if (step === "done") {
        return (
            <div className="mx-auto max-w-2xl px-4 py-20 text-center">
                <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
                    <Check className="size-10" strokeWidth={3} />
                </span>
                <h1 className="text-foreground mt-6 text-2xl font-extrabold">
                    후기가 등록되었습니다
                </h1>
                <p className="text-muted-foreground mt-3 leading-relaxed">
                    소중한 후기를 남겨주셔서 감사합니다.
                    <br />
                    작성하신 후기는 이용 후기 목록 맨 위에서 확인하실 수 있어요.
                </p>
                <div className="mt-8 flex justify-center gap-3">
                    <Link
                        href="/mypage"
                        className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                    >
                        마이페이지로
                    </Link>
                    <Link
                        href="/review"
                        className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                    >
                        후기 목록에서 확인하기
                    </Link>
                </div>
            </div>
        );
    }

    /* ---------- 후기 작성 폼 ---------- */
    return (
        <div className="mx-auto max-w-4xl px-4 py-10 md:py-14">
            <button
                type="button"
                onClick={() => setStep("select")}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-semibold transition-colors"
            >
                <ChevronLeft className="size-4" />
                서비스 다시 선택
            </button>

            {/* 이용하신 서비스 정보 */}
            <section className="border-border bg-background mt-4 rounded-2xl border p-6">
                <h2 className="text-foreground text-lg font-bold">
                    이용하신 서비스 정보
                </h2>
                <div className="mt-4">
                    {selected && <ServiceCard service={selected} />}
                </div>
            </section>

            {/* 파트너 평점 */}
            <section className="border-border bg-background mt-5 rounded-2xl border p-6">
                <h2 className="text-foreground text-lg font-bold">
                    파트너 평점
                </h2>
                <div className="mt-4">
                    <StarInput value={rating} onChange={setRating} />
                </div>
            </section>

            {/* 후기 작성 */}
            <section className="border-border bg-background mt-5 rounded-2xl border p-6">
                <h2 className="text-foreground text-lg font-bold">후기 작성</h2>

                <label className="text-foreground mt-5 block text-sm font-bold">
                    제목 <span className="text-destructive">*</span>
                </label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, 40))}
                    maxLength={40}
                    placeholder="후기 제목을 입력해 주세요 (2~40자)"
                    className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                />
                <p className="text-muted-foreground mt-1 text-right text-xs">
                    {title.length} / 40자
                </p>

                <label className="text-foreground mt-2 block text-sm font-bold">
                    내용 <span className="text-destructive">*</span>
                </label>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value.slice(0, 600))}
                    maxLength={600}
                    placeholder="동행 파트너와의 경험, 만족했던 점, 개선되었으면 하는 점 등을 자유롭게 적어주세요."
                    className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 mt-2 min-h-40 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                />
                <p className="text-muted-foreground mt-1 text-right text-xs">
                    {content.length} / 600자
                </p>

                <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        disabled={!canSubmit || pending}
                        onClick={onSubmit}
                        className={cn(
                            "rounded-lg px-8 py-3 text-sm font-bold transition-colors",
                            canSubmit && !pending
                                ? "bg-brand text-brand-foreground hover:bg-brand/90"
                                : "bg-muted text-muted-foreground cursor-not-allowed",
                        )}
                    >
                        작성하기
                    </button>
                </div>
            </section>
        </div>
    );
}

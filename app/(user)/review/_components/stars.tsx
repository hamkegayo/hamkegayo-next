"use client";

import { useState } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** 별점 표시용 (읽기 전용) */
export function Stars({
    rating,
    className,
}: {
    rating: number;
    className?: string;
}) {
    return (
        <div className={cn("flex gap-0.5", className)}>
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

/** 별점 입력용 (후기 작성) */
export function StarInput({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    const [hover, setHover] = useState(0);
    const active = hover || value;

    return (
        <div className="flex items-center gap-3">
            <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
                {Array.from({ length: 5 }).map((_, i) => {
                    const n = i + 1;
                    return (
                        <button
                            key={n}
                            type="button"
                            aria-label={`${n}점`}
                            onMouseEnter={() => setHover(n)}
                            onClick={() => onChange(n)}
                            className="transition-transform hover:scale-110"
                        >
                            <Star
                                className={cn(
                                    "size-8",
                                    n <= active
                                        ? "fill-amber-400 text-amber-400"
                                        : "fill-muted text-muted",
                                )}
                            />
                        </button>
                    );
                })}
            </div>
            <span className="text-muted-foreground text-sm">
                {value ? `${value}.0점` : "별점을 선택해 주세요"}
            </span>
        </div>
    );
}

import { cn } from "@/lib/utils";
import { TOTAL_STEPS } from "../_store/reservation-store";

function StepDots({ current }: { current: number }) {
    return (
        <div className="mt-6 flex items-center justify-center gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <span
                    key={i}
                    className={cn(
                        "h-2 rounded-full transition-all",
                        i + 1 === current ? "bg-brand w-5" : "bg-border w-2",
                    )}
                />
            ))}
        </div>
    );
}

/** 단계 상단 회색 밴드 — 번호 제목 + 안내 문구 + 진행 점 */
export function StepBand({
    index,
    title,
    subtitles,
}: {
    index: number;
    title: string;
    subtitles: string[];
}) {
    return (
        <div className="border-border bg-muted/40 border-b">
            <div className="mx-auto max-w-3xl px-4 py-12 text-center">
                <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                    <span className="text-brand">{index}.</span> {title}
                </h1>
                {subtitles.map((s, i) => (
                    <p
                        key={s}
                        className={cn(
                            "text-muted-foreground",
                            i === 0 ? "mt-4" : "mt-1",
                        )}
                    >
                        {s}
                    </p>
                ))}
                <StepDots current={index} />
            </div>
        </div>
    );
}

/** 하단 이전/다음 네비게이션 */
export function StepNav({
    onPrev,
    nextLabel = "다음",
    nextType = "submit",
    onNext,
}: {
    onPrev?: () => void;
    nextLabel?: string;
    nextType?: "submit" | "button";
    onNext?: () => void;
}) {
    return (
        <div className="flex justify-center gap-3 pt-4">
            {onPrev && (
                <button
                    type="button"
                    onClick={onPrev}
                    className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-8 py-3 text-sm font-bold transition-colors"
                >
                    이전으로 이동
                </button>
            )}
            <button
                type={nextType}
                onClick={onNext}
                className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-10 py-3 text-sm font-bold transition-colors"
            >
                {nextLabel}
            </button>
        </div>
    );
}

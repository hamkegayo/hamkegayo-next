"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

import { Modal } from "@/components/ui/modal";

function Counter({ value }: { value: number }) {
    return (
        <p className="text-muted-foreground mt-1 text-right text-xs">
            {value} / 1000
        </p>
    );
}

export function ServiceFeedbackModal({
    open,
    onClose,
    onSubmit,
}: {
    open: boolean;
    onClose: () => void;
    onSubmit: () => void;
}) {
    const [impression, setImpression] = useState("");
    const [note, setNote] = useState("");

    const close = () => {
        setImpression("");
        setNote("");
        onClose();
    };

    return (
        <Modal open={open} onClose={close} className="max-w-lg">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    서비스 종료 후 피드백
                </h3>
                <button
                    type="button"
                    onClick={close}
                    aria-label="닫기"
                    className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
                >
                    <X className="size-5" />
                </button>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
                이번 서비스에 대한 경험을 공유해주세요.
            </p>

            <p className="text-foreground mt-5 text-sm font-bold">
                서비스를 마치고 느낀 점을 자유롭게 작성해주세요.
            </p>
            <div className="mt-2">
                <textarea
                    value={impression}
                    onChange={(e) =>
                        setImpression(e.target.value.slice(0, 1000))
                    }
                    maxLength={1000}
                    placeholder="예: 전반적으로 좋았던 점, 아쉬웠던 점, 개선되었으면 하는 점 등"
                    className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 min-h-24 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                />
                <Counter value={impression.length} />
            </div>

            <p className="text-foreground mt-4 text-sm font-bold">
                이용자에 대한 특이사항을 작성해주세요.
            </p>
            <div className="mt-2">
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                    maxLength={1000}
                    placeholder="예: 이용자의 성향, 건강 상태, 주의사항, 다음 파트너에게 전달하고 싶은 내용"
                    className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 min-h-24 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                />
                <Counter value={note.length} />
            </div>

            <p className="bg-muted/50 text-muted-foreground mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm">
                <Info className="text-brand size-4 shrink-0" />
                작성해주신 피드백은 서비스 품질 향상을 위해 소중하게 활용됩니다.
            </p>

            <div className="mt-5 flex gap-3">
                <button
                    type="button"
                    onClick={close}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    피드백 제출
                </button>
            </div>
        </Modal>
    );
}

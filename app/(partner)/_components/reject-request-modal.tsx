"use client";

import { useState } from "react";
import {
    Briefcase,
    Clock,
    MapPin,
    MoreHorizontal,
    UserRound,
    X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

const REASONS: {
    value: string;
    icon: LucideIcon;
    label: string;
    desc: string;
}[] = [
    {
        value: "time",
        icon: Clock,
        label: "시간 불가",
        desc: "요청하신 시간에 맞추기 어렵습니다.",
    },
    {
        value: "distance",
        icon: MapPin,
        label: "거리 부담",
        desc: "이동 거리가 멀어 부담됩니다.",
    },
    {
        value: "type",
        icon: Briefcase,
        label: "서비스 유형 불가",
        desc: "해당 서비스 유형은 제공이 어렵습니다.",
    },
    {
        value: "personal",
        icon: UserRound,
        label: "개인 사유",
        desc: "개인적인 사정으로 요청을 수락하기 어렵습니다.",
    },
    {
        value: "etc",
        icon: MoreHorizontal,
        label: "기타",
        desc: "위 사유에 해당하지 않습니다.",
    },
];

export function RejectRequestModal({
    open,
    onClose,
    onConfirm,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: (reason: string, note: string) => void;
}) {
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");

    const close = () => {
        setReason("");
        setNote("");
        onClose();
    };

    return (
        <Modal open={open} onClose={close} className="max-w-lg">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    요청 거절하기
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
                거절 사유를 선택해 주세요.
            </p>

            <p className="text-foreground mt-5 text-sm font-bold">
                거절 사유 선택 <span className="text-destructive">(필수)</span>
            </p>
            <div className="divide-border border-border mt-3 divide-y overflow-hidden rounded-xl border">
                {REASONS.map(({ value, icon: Icon, label, desc }) => {
                    const active = reason === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setReason(value)}
                            className="hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                        >
                            <span
                                className={cn(
                                    "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                                    active ? "border-brand" : "border-input",
                                )}
                            >
                                {active && (
                                    <span className="bg-brand size-2.5 rounded-full" />
                                )}
                            </span>
                            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                                <Icon className="size-4" />
                            </span>
                            <span className="min-w-0">
                                <span className="text-foreground block font-bold">
                                    {label}
                                </span>
                                <span className="text-muted-foreground block text-sm">
                                    {desc}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            <p className="text-foreground mt-5 text-sm font-bold">
                추가 의견{" "}
                <span className="text-muted-foreground font-normal">
                    (선택)
                </span>
            </p>
            <div className="mt-2">
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 200))}
                    maxLength={200}
                    placeholder="추가로 전달하고 싶은 내용을 입력해주세요."
                    className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 min-h-20 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                />
                <p className="text-muted-foreground mt-1 text-right text-xs">
                    {note.length} / 200
                </p>
            </div>

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
                    disabled={!reason}
                    onClick={() => onConfirm(reason, note)}
                    className={cn(
                        "flex-1 rounded-lg px-4 py-3 text-sm font-bold text-white transition-colors",
                        reason
                            ? "bg-destructive hover:bg-destructive/90"
                            : "bg-destructive/40 cursor-not-allowed",
                    )}
                >
                    거절하기
                </button>
            </div>
        </Modal>
    );
}

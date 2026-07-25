"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

/** 단일 입력(활동 지역/시간, 선호 병원 등) 추가용 공통 모달 */
export function SimpleAddModal({
    open,
    onClose,
    onAdd,
    title,
    description,
    label,
    placeholder,
}: {
    open: boolean;
    onClose: () => void;
    onAdd: (value: string) => void;
    title: string;
    description: string;
    label: string;
    placeholder: string;
}) {
    const [value, setValue] = useState("");

    const close = () => {
        setValue("");
        onClose();
    };

    const submit = () => {
        const v = value.trim();
        if (!v) return;
        onAdd(v);
        close();
    };

    return (
        <Modal open={open} onClose={close} className="max-w-sm">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    {title}
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
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>

            <label className="text-foreground mt-5 block text-sm font-bold">
                {label}
            </label>
            <input
                type="text"
                value={value}
                autoFocus
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={placeholder}
                className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
            />

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={close}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!value.trim()}
                    className={cn(
                        "flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors",
                        value.trim()
                            ? "bg-brand text-brand-foreground hover:bg-brand/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                    )}
                >
                    추가하기
                </button>
            </div>
        </Modal>
    );
}

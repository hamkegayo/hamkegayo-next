"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 공통 모달 셸.
 * 딤 배경 + 중앙 정렬 패널 + ESC/배경 클릭 닫기 + 열림 시 배경 스크롤 잠금.
 * 내부 내용은 children 으로 자유롭게 구성한다.
 */
export function Modal({
    open,
    onClose,
    children,
    className,
    dismissible = true,
}: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
    /** ESC·배경 클릭으로 닫을 수 있는지 (기본 true) */
    dismissible?: boolean;
}) {
    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && dismissible) onClose();
        };
        document.addEventListener("keydown", onKey);
        // 배경 스크롤 잠금. 닫을 때는 이전 값 복원 대신 "" 로 초기화한다.
        // (base-ui Menu 등 다른 컴포넌트가 걸어둔 일시적 잠금값을 되살리지 않도록)
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [open, dismissible, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40"
                onClick={dismissible ? onClose : undefined}
            />
            <div
                role="dialog"
                aria-modal="true"
                className={cn(
                    "bg-background relative z-10 w-full max-w-md rounded-2xl p-6 shadow-xl md:p-8",
                    className,
                )}
            >
                {children}
            </div>
        </div>
    );
}

/**
 * 확인/취소 2버튼 패턴 모달 (로그아웃·삭제 확인 등).
 * tone: "brand"(기본) | "destructive"
 */
export function ConfirmModal({
    open,
    onClose,
    onConfirm,
    title,
    description,
    cancelLabel = "취소",
    confirmLabel = "확인",
    tone = "brand",
    confirmDisabled = false,
    children,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description?: React.ReactNode;
    cancelLabel?: string;
    confirmLabel?: string;
    tone?: "brand" | "destructive";
    confirmDisabled?: boolean;
    /** 제목/설명과 버튼 사이에 넣을 부가 내용 (체크박스 등) */
    children?: React.ReactNode;
}) {
    return (
        <Modal open={open} onClose={onClose} className="max-w-sm">
            <h3 className="text-foreground text-center text-lg font-extrabold">
                {title}
            </h3>
            {description && (
                <div className="text-muted-foreground mt-3 text-center text-sm leading-relaxed">
                    {description}
                </div>
            )}

            {children}

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={confirmDisabled}
                    className={cn(
                        "flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed",
                        confirmDisabled
                            ? "bg-muted text-muted-foreground"
                            : tone === "destructive"
                              ? "border-destructive/40 bg-background text-destructive hover:bg-destructive/5 border"
                              : "bg-brand text-brand-foreground hover:bg-brand/90",
                    )}
                >
                    {confirmLabel}
                </button>
            </div>
        </Modal>
    );
}

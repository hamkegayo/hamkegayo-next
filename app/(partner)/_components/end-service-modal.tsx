"use client";

import { X } from "lucide-react";

import { Modal } from "@/components/ui/modal";

export function EndServiceModal({
    open,
    onClose,
    onConfirm,
    serviceName,
    startAt,
    endAt,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    serviceName: string;
    startAt: string;
    endAt: string;
}) {
    return (
        <Modal open={open} onClose={onClose} className="max-w-md">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    서비스를 종료할까요?
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
                >
                    <X className="size-5" />
                </button>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
                종료 시간이 기록됩니다. 종료 후에는 귀가 안내가 활성화됩니다.
            </p>

            <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">서비스</dt>
                    <dd className="text-foreground text-right font-bold">
                        {serviceName}
                    </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">시작 시간</dt>
                    <dd className="text-foreground text-right font-bold">
                        {startAt}
                    </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">종료 시간</dt>
                    <dd className="text-foreground text-right font-bold">
                        {endAt}
                    </dd>
                </div>
            </dl>

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    서비스 종료
                </button>
            </div>
        </Modal>
    );
}

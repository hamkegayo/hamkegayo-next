"use client";

import { Check, Download } from "lucide-react";

import { Modal } from "@/components/ui/modal";

export function ReportGeneratedModal({
    open,
    onClose,
    onDownload,
    onGoList,
    customerName,
}: {
    open: boolean;
    onClose: () => void;
    onDownload: () => void;
    onGoList: () => void;
    customerName: string;
}) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            className="max-w-sm"
            dismissible={false}
        >
            <div className="flex flex-col items-center text-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
                    <Check className="size-8" strokeWidth={3} />
                </span>
                <h3 className="text-foreground mt-4 text-lg font-extrabold">
                    보호자 리포트가 생성되었습니다
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    보호자({customerName} 님)에게 리포트 링크가 문자로
                    발송되었습니다.
                    <br />
                    PDF로도 내려받을 수 있습니다.
                </p>
            </div>

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={onDownload}
                    className="border-border bg-background text-foreground hover:bg-muted flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    <Download className="size-4" />
                    PDF 다운로드
                </button>
                <button
                    type="button"
                    onClick={onGoList}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    리포트 작성으로 돌아가기
                </button>
            </div>
        </Modal>
    );
}

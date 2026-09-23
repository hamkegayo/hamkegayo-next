"use client";

import { useState } from "react";
import { toast } from "sonner";

export function TransferFileButton({
    batchId,
    disabled,
}: {
    batchId: string;
    disabled: boolean;
}) {
    const [pending, setPending] = useState(false);

    const download = async () => {
        const reason = window.prompt(
            "파일 발급 사유를 5자 이상 입력해 주세요.",
        );
        if (!reason) return;
        setPending(true);
        try {
            const response = await fetch(
                "/api/admin/settlements/transfer-file",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ batchId, reason }),
                },
            );
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as {
                    message?: string;
                } | null;
                toast.error(
                    body?.message ?? "이체 파일을 발급하지 못했습니다.",
                );
                return;
            }
            const blob = await response.blob();
            const disposition =
                response.headers.get("content-disposition") ?? "";
            const filename =
                /filename="([^"]+)"/.exec(disposition)?.[1] ?? "transfer.csv";
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            anchor.click();
            URL.revokeObjectURL(url);
            toast.success("이체 파일을 발급했습니다.");
        } finally {
            setPending(false);
        }
    };

    return (
        <button
            type="button"
            disabled={disabled || pending}
            onClick={download}
            className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
            {pending ? "발급 중..." : "이체 CSV 발급"}
        </button>
    );
}

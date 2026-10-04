"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setOpeningEvent } from "./actions";

export function EventControls({
    active,
    ready,
}: {
    active: boolean;
    ready: boolean;
}) {
    const [reason, setReason] = useState("");
    const [pending, start] = useTransition();
    return (
        <div className="border-border mt-6 flex flex-wrap items-end gap-3 rounded-xl border p-4">
            <label className="flex flex-1 flex-col gap-2 text-sm">
                변경 사유
                <input
                    className="border-border bg-background rounded-lg border p-2"
                    value={reason}
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="변경 사유를 5자 이상 입력"
                />
            </label>
            <button
                disabled={
                    pending || (!active && !ready) || reason.trim().length < 5
                }
                className="bg-brand text-brand-foreground rounded-lg px-4 py-2 font-bold disabled:opacity-40"
                onClick={() =>
                    start(async () => {
                        const result = await setOpeningEvent(!active, reason);
                        if (result.ok) {
                            toast.success(result.message);
                            setReason("");
                        } else toast.error(result.message);
                    })
                }
            >
                {pending
                    ? "처리 중"
                    : active
                      ? "신규 배정 중단"
                      : "이벤트 활성화"}
            </button>
        </div>
    );
}

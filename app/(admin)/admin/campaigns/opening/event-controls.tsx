"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setOpeningEvent, closeOpeningEvent } from "./actions";

export function EventControls({
    active,
    ready,
    closed,
}: {
    active: boolean;
    ready: boolean;
    closed: boolean;
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
                    pending ||
                    closed ||
                    (!active && !ready) ||
                    reason.trim().length < 5
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
            <button
                className="border-border rounded-lg border px-4 py-2 disabled:opacity-40"
                disabled={pending || closed || reason.trim().length < 5}
                onClick={() =>
                    start(async () => {
                        if (
                            !window.confirm(
                                "행사를 영구 종료할까요? 관련 취소·환불 완료 후 이메일 HMAC을 파기하며 다시 활성화할 수 없습니다.",
                            )
                        )
                            return;
                        const result = await closeOpeningEvent(reason);
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.message);
                    })
                }
            >
                {closed ? "행사 종료됨" : "행사 종료"}
            </button>
        </div>
    );
}

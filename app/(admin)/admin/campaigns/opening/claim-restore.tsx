"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { restoreOpeningEvent } from "./actions";

export function ClaimRestore({ id }: { id: string }) {
    const [reason, setReason] = useState("");
    const [pending, start] = useTransition();
    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs">
                회사·파트너 귀책 확인 사유
                <input
                    className="border-border mt-1 w-full rounded border p-2"
                    value={reason}
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                />
            </label>
            <button
                className="text-brand text-xs underline disabled:opacity-40"
                disabled={pending || reason.trim().length < 5}
                onClick={() =>
                    start(async () => {
                        if (
                            !window.confirm(
                                "회사·파트너 사유의 제공 불가와 실제 전액 환불을 확인했습니까? 고객 취소·노쇼에는 복원할 수 없습니다.",
                            )
                        )
                            return;
                        const result = await restoreOpeningEvent(id, reason);
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.message);
                    })
                }
            >
                전액 환불 확인 후 혜택 복원
            </button>
        </div>
    );
}

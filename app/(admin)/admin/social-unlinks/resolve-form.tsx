"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { resolveSocialUnlink } from "./actions";

export function ResolveForm({ id }: { id: string }) {
    const [memo, setMemo] = useState("");
    const [pending, startTransition] = useTransition();
    const valid = memo.trim().length >= 2;
    return (
        <div className="mt-4 space-y-2">
            <label className="block text-sm" htmlFor={`unlink-${id}`}>
                처리 메모 (2-1000자, 접속기록에 남습니다)
            </label>
            <textarea
                id={`unlink-${id}`}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                maxLength={1000}
                disabled={pending}
                placeholder="예) 회원탈퇴 절차로 처리함 / 진행 중 예약이 있어 고객에게 안내 후 처리 예정"
                className="bg-background w-full rounded-lg border p-3 text-sm"
            />
            <button
                type="button"
                disabled={!valid || pending}
                onClick={() =>
                    startTransition(async () => {
                        const result = await resolveSocialUnlink({ id, memo });
                        if (result.ok)
                            toast.success("처리 완료로 표시했습니다.");
                        else toast.error(result.message);
                    })
                }
                className="bg-brand text-brand-foreground rounded-lg px-4 py-2 font-bold disabled:opacity-50"
            >
                처리 완료
            </button>
        </div>
    );
}

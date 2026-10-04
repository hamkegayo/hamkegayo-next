"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { excludeOpeningEvent } from "./actions";

export function ExclusionControls() {
    const [id, setId] = useState("");
    const [reason, setReason] = useState("");
    const [pending, start] = useTransition();
    return (
        <fieldset className="border-border mt-4 flex flex-wrap gap-3 rounded-xl border p-4">
            <legend className="px-2 text-sm font-bold">
                직원·테스트 계정 제외
            </legend>
            <label className="flex flex-col gap-1 text-sm">
                회원 UUID
                <input
                    className="border-border rounded border p-2"
                    value={id}
                    maxLength={36}
                    onChange={(event) => setId(event.target.value)}
                />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
                사유
                <input
                    className="border-border rounded border p-2"
                    value={reason}
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="개인정보를 제외한 사유 5자 이상"
                />
            </label>
            {[true, false].map((excluded) => (
                <button
                    key={String(excluded)}
                    className="border-border self-end rounded border px-3 py-2 disabled:opacity-40"
                    disabled={
                        pending || id.length !== 36 || reason.trim().length < 5
                    }
                    onClick={() =>
                        start(async () => {
                            const result = await excludeOpeningEvent(
                                id.trim(),
                                excluded,
                                reason,
                            );
                            if (result.ok) toast.success(result.message);
                            else toast.error(result.message);
                        })
                    }
                >
                    {excluded ? "제외 등록" : "제외 해제"}
                </button>
            ))}
        </fieldset>
    );
}

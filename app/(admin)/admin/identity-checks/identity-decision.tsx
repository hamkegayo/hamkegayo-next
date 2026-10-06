"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/modal";
import { decidePartnerIdentity } from "./actions";

export function IdentityDecision({ partnerId }: { partnerId: string }) {
    const [reason, setReason] = useState("");
    const [verified, setVerified] = useState<boolean | null>(null);
    const [pending, startTransition] = useTransition();
    const valid = reason.trim().length >= 2 && reason.length <= 300;
    return (
        <div className="mt-4 space-y-3">
            <label className="block text-sm" htmlFor={`identity-${partnerId}`}>
                확인 방법 또는 반려 사유 (반려 시 파트너에게 전달, 2~300자)
            </label>
            <textarea
                id={`identity-${partnerId}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={300}
                disabled={pending}
                placeholder="예) 간호사 면허증 생년월일과 일치"
                className="bg-background w-full rounded-lg border p-3 text-sm"
            />
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setVerified(true)}
                    disabled={pending || !valid}
                    className="bg-brand text-brand-foreground rounded-lg px-4 py-2 font-bold disabled:opacity-50"
                >
                    본인확인 완료
                </button>
                <button
                    type="button"
                    onClick={() => setVerified(false)}
                    disabled={pending || !valid}
                    className="border-border rounded-lg border px-4 py-2 font-bold disabled:opacity-50"
                >
                    반려
                </button>
            </div>
            <ConfirmModal
                open={verified !== null}
                onClose={() => {
                    if (!pending) setVerified(null);
                }}
                title={verified ? "본인확인 완료로 저장" : "본인확인 반려"}
                description="저장하면 생년월일을 즉시 파기하고 결과만 남깁니다. 되돌릴 수 없습니다."
                confirmDisabled={pending || !valid}
                onConfirm={() =>
                    startTransition(async () => {
                        try {
                            const result = await decidePartnerIdentity({
                                partnerId,
                                verified: verified === true,
                                reason,
                            });
                            if (!result.ok) {
                                toast.error(result.message);
                                return;
                            }
                            toast.success(
                                "결정을 저장하고 생년월일을 파기했습니다.",
                            );
                            setVerified(null);
                        } catch {
                            toast.error(
                                "저장하지 못했습니다. 다시 시도해 주세요.",
                            );
                        }
                    })
                }
            />
        </div>
    );
}

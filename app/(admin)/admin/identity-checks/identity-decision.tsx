"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/modal";
import { decidePartnerIdentity } from "./actions";

/** DB identity_reason_has_personal_data 와 같은 규칙 — 화면 안내용이고 최종 판정은 DB 다 */
const PERSONAL_DATA =
    /[0-9]{6,}|[0-9]{2,4}\s*[-./년]\s*[0-9]{1,2}\s*[-./월]\s*[0-9]{1,2}|주민|생년월일\s*[:은는]?\s*[0-9]/;

export function IdentityDecision({
    partnerId,
    submittedAt,
}: {
    partnerId: string;
    /** 화면이 읽은 제출 시각 — 그 사이 바뀌면 결정이 거부된다 */
    submittedAt: string;
}) {
    const [reason, setReason] = useState("");
    const [verified, setVerified] = useState<boolean | null>(null);
    const [pending, startTransition] = useTransition();
    const trimmed = reason.trim();
    const hasPersonalData = PERSONAL_DATA.test(trimmed);
    const rejectValid =
        trimmed.length >= 2 && reason.length <= 300 && !hasPersonalData;
    return (
        <div className="mt-4 space-y-3">
            <button
                type="button"
                onClick={() => setVerified(true)}
                disabled={pending}
                className="bg-brand text-brand-foreground rounded-lg px-4 py-2 font-bold disabled:opacity-50"
            >
                본인확인 완료
            </button>
            <label className="block text-sm" htmlFor={`identity-${partnerId}`}>
                반려 사유 (파트너에게 알림으로 전달, 2~300자)
            </label>
            <textarea
                id={`identity-${partnerId}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={300}
                disabled={pending}
                placeholder="예) 등록된 자격 증빙의 생년월일과 다릅니다. 증빙을 다시 확인해 주세요."
                aria-invalid={hasPersonalData}
                className="bg-background w-full rounded-lg border p-3 text-sm"
            />
            <p
                className={
                    hasPersonalData
                        ? "text-destructive text-sm"
                        : "text-muted-foreground text-sm"
                }
            >
                생년월일·주민번호 등 숫자는 적지 마세요. 사유는 접속기록과
                알림에 남습니다.
            </p>
            <button
                type="button"
                onClick={() => setVerified(false)}
                disabled={pending || !rejectValid}
                className="border-border rounded-lg border px-4 py-2 font-bold disabled:opacity-50"
            >
                반려
            </button>
            <ConfirmModal
                open={verified !== null}
                onClose={() => {
                    if (!pending) setVerified(null);
                }}
                title={verified ? "본인확인 완료로 저장" : "본인확인 반려"}
                description="저장하면 생년월일을 즉시 파기하고 결과만 남깁니다. 되돌릴 수 없습니다."
                confirmDisabled={
                    pending || (verified === false && !rejectValid)
                }
                onConfirm={() =>
                    startTransition(async () => {
                        try {
                            const result = await decidePartnerIdentity({
                                partnerId,
                                expectedSubmittedAt: submittedAt,
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

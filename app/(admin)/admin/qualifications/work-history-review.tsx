"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/modal";
import { reviewWorkHistory } from "./actions";

export function WorkHistoryReview({
    id,
    status,
}: {
    id: string;
    status: "PENDING" | "VERIFIED";
}) {
    const [reason, setReason] = useState("");
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const valid = reason.trim().length >= 5 && reason.length <= 500;
    return (
        <div className="mt-4 space-y-3">
            <label className="block text-sm" htmlFor={`work-review-${id}`}>
                증빙 확인 방법 및 심사 안내 (파트너에게 전달, 5~500자)
            </label>
            <textarea
                id={`work-review-${id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                disabled={pending}
                className="bg-background w-full rounded-lg border p-3 text-sm"
            />
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={pending || !valid}
                className="bg-brand text-brand-foreground rounded-lg px-4 py-2 font-bold disabled:opacity-50"
            >
                {status === "PENDING" ? "검증 완료" : "심사 대기로 변경"}
            </button>
            <ConfirmModal
                open={open}
                onClose={() => {
                    if (!pending) setOpen(false);
                }}
                title="근무 경력 심사 결과 저장"
                description="재직·경력 증빙을 확인한 뒤 저장해 주세요. 검증 완료된 항목은 공개 동의한 파트너의 예약 상세에 표시됩니다."
                confirmDisabled={pending || !valid}
                onConfirm={() =>
                    startTransition(async () => {
                        try {
                            const result = await reviewWorkHistory({
                                id,
                                expected: status,
                                status:
                                    status === "PENDING"
                                        ? "VERIFIED"
                                        : "PENDING",
                                reason,
                            });
                            if (!result.ok) {
                                toast.error(result.message);
                                return;
                            }
                            setOpen(false);
                            setReason("");
                            toast.success("심사 결과를 저장했습니다.");
                        } catch {
                            toast.error("심사 결과 저장에 실패했습니다.");
                        }
                    })
                }
            />
        </div>
    );
}

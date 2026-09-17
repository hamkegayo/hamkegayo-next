"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/modal";
import { openQualificationFile, reviewQualification } from "./actions";

export function ReviewControls({
    id,
    status,
}: {
    id: string;
    status: "PENDING" | "VERIFIED";
}) {
    const [reason, setReason] = useState("");
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const valid = reason.trim().length >= 5 && reason.length <= 500;
    return (
        <div className="mt-4 space-y-3">
            <label
                className="block text-sm font-semibold"
                htmlFor={`reason-${id}`}
            >
                열람·심사 사유 (5~500자)
            </label>
            <textarea
                id={`reason-${id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                disabled={pending}
                className="border-input bg-background w-full rounded-lg border p-3 text-sm"
            />
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    disabled={pending || !valid}
                    className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() =>
                        startTransition(async () => {
                            setFileUrl(null);
                            try {
                                const result = await openQualificationFile(
                                    id,
                                    reason,
                                );
                                if (!result.ok) {
                                    toast.error(result.message);
                                    return;
                                }
                                setFileUrl(result.url);
                            } catch {
                                toast.error("파일 열람 요청에 실패했습니다.");
                            }
                        })
                    }
                >
                    증빙 열람 요청
                </button>
                <button
                    type="button"
                    disabled={pending || !valid}
                    className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() => setConfirmOpen(true)}
                >
                    {pending
                        ? "처리 중…"
                        : status === "PENDING"
                          ? "인증 완료"
                          : "심사 대기로 변경"}
                </button>
            </div>
            <ConfirmModal
                open={confirmOpen}
                onClose={() => {
                    if (!pending) setConfirmOpen(false);
                }}
                title="자격 심사 결과 저장"
                description={
                    status === "PENDING"
                        ? "증빙을 확인했으며 인증 완료로 처리하시겠습니까?"
                        : "인증을 해제하고 심사 대기로 되돌리시겠습니까?"
                }
                confirmLabel="저장"
                cancelLabel="취소"
                confirmDisabled={pending || !valid}
                onConfirm={() => {
                    const next = status === "PENDING" ? "VERIFIED" : "PENDING";
                    startTransition(async () => {
                        try {
                            const result = await reviewQualification({
                                id,
                                expected: status,
                                status: next,
                                reason,
                            });
                            if (result.ok) {
                                toast.success(result.message);
                                setReason("");
                                setFileUrl(null);
                                setConfirmOpen(false);
                            } else toast.error(result.message);
                        } catch {
                            toast.error("심사 결과 저장에 실패했습니다.");
                        }
                    });
                }}
            />
            {fileUrl && (
                <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="text-brand block text-sm underline"
                >
                    증빙 파일 열기 (링크 유효시간 1분)
                </a>
            )}
        </div>
    );
}

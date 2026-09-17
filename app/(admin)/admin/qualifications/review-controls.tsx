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
    const [accessReason, setAccessReason] = useState("");
    const [reviewReason, setReviewReason] = useState("");
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const accessValid =
        accessReason.trim().length >= 5 && accessReason.length <= 500;
    const reviewValid =
        reviewReason.trim().length >= 5 && reviewReason.length <= 500;
    return (
        <div className="mt-4 space-y-3">
            <label
                className="block text-sm font-semibold"
                htmlFor={`access-reason-${id}`}
            >
                증빙 열람 사유 (관리자 기록용, 5~500자)
            </label>
            <textarea
                id={`access-reason-${id}`}
                value={accessReason}
                onChange={(e) => setAccessReason(e.target.value)}
                maxLength={500}
                disabled={pending}
                className="border-input bg-background w-full rounded-lg border p-3 text-sm"
            />
            <label
                className="block text-sm font-semibold"
                htmlFor={`review-reason-${id}`}
            >
                심사 결과 안내 (파트너에게 전달, 5~500자)
            </label>
            <textarea
                id={`review-reason-${id}`}
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                maxLength={500}
                disabled={pending}
                className="border-input bg-background w-full rounded-lg border p-3 text-sm"
            />
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    disabled={pending || !accessValid}
                    className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() =>
                        startTransition(async () => {
                            setFileUrl(null);
                            try {
                                const result = await openQualificationFile(
                                    id,
                                    accessReason,
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
                    disabled={pending || !reviewValid}
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
                        ? "인증 완료 처리 후 입력한 안내 사유를 파트너에게 알림으로 전달합니다."
                        : "심사 대기로 되돌린 뒤 수정 요청 사유를 파트너에게 알림으로 전달합니다."
                }
                confirmLabel="저장"
                cancelLabel="취소"
                confirmDisabled={pending || !reviewValid}
                onConfirm={() => {
                    const next = status === "PENDING" ? "VERIFIED" : "PENDING";
                    startTransition(async () => {
                        try {
                            const result = await reviewQualification({
                                id,
                                expected: status,
                                status: next,
                                reason: reviewReason,
                            });
                            if (result.ok) {
                                toast.success(result.message);
                                setAccessReason("");
                                setReviewReason("");
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
                    증빙 파일 열기 (링크 유효시간 5분)
                </a>
            )}
        </div>
    );
}

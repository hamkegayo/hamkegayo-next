"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";

export function IncidentCancelButton({
    incidentId,
    orderId,
}: {
    incidentId: string;
    orderId: string | null;
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [pending, setPending] = useState(false);
    const router = useRouter();
    const submit = async (inspect = false) => {
        if (pending || (!inspect && !confirmed)) return;
        setPending(true);
        try {
            const response = await fetch("/api/admin/payments/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    incidentId,
                    reason: inspect ? "PG 원거래 상태 재조회" : reason,
                    confirm: confirmed,
                    inspect,
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                toast.error(result.message);
                return;
            }
            toast.success(result.message);
            setOpen(false);
            router.refresh();
        } catch {
            toast.error(
                "결과를 확인하지 못했습니다. 다시 실행하지 말고 PG 관리자에서 확인해 주세요.",
            );
        } finally {
            setPending(false);
        }
    };
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="border-destructive text-destructive cursor-pointer rounded-lg border px-4 py-2 text-sm font-bold"
            >
                미기록 승인 거래 취소
            </button>
            <Modal
                open={open}
                onClose={() => {
                    if (!pending) setOpen(false);
                }}
                className="max-w-md"
            >
                <h3 className="text-lg font-bold">
                    미기록 승인 거래 전액 취소
                </h3>
                <p className="mt-3 text-sm">주문: {orderId ?? "없음"}</p>
                <p className="text-muted-foreground mt-3 text-sm">
                    확정에 실패한 거래만 처리합니다. 정상 결제·부분 환불·서비스
                    연결 건은 차단합니다. 전체/정산 담당자와 MFA가 필요합니다.
                    결과가 불확정하면 재시도하지 말고 PG에서 확인해 주세요.
                </p>
                <label className="mt-4 block text-sm">
                    취소 사유 (5~500자)
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={500}
                        disabled={pending}
                        className="border-input mt-2 w-full rounded-lg border p-3"
                    />
                </label>
                <label className="mt-4 flex gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={pending}
                        onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    이 요청은 실제 전액 취소이며 되돌릴 수 없음을 확인했습니다.
                </label>
                <div className="mt-5 flex gap-3">
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => submit(true)}
                        className="flex-1 rounded-lg border p-3"
                    >
                        결과 재조회
                    </button>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => setOpen(false)}
                        className="flex-1 rounded-lg border p-3"
                    >
                        닫기
                    </button>
                    <button
                        type="button"
                        onClick={() => submit()}
                        disabled={
                            pending || !confirmed || reason.trim().length < 5
                        }
                        className="bg-destructive flex-1 cursor-pointer rounded-lg p-3 text-white disabled:opacity-50"
                    >
                        {pending ? "처리 중…" : "실제 전액 취소"}
                    </button>
                </div>
            </Modal>
        </>
    );
}

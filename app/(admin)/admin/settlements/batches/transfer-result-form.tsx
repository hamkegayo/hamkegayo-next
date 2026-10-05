"use client";

import { useState, useTransition } from "react";
import { recordTransferResult } from "../actions";

export function TransferResultForm({
    batchId,
    fileIssued,
}: {
    batchId: string;
    fileIssued: boolean;
}) {
    const [status, setStatus] = useState<"COMPLETED" | "CANCELLED">(
        fileIssued ? "COMPLETED" : "CANCELLED",
    );
    const [reference, setReference] = useState("");
    const [reason, setReason] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();
    return (
        <form
            className="border-border mt-5 space-y-3 rounded-lg border p-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (!confirmed) return;
                startTransition(async () => {
                    const result = await recordTransferResult(
                        batchId,
                        status,
                        reference,
                        reason,
                    );
                    setMessage(result.message);
                });
            }}
        >
            <h3 className="font-bold">은행 결과 기록</h3>
            <p className="text-muted-foreground text-sm">
                은행에서 확인한 결과를 기록합니다. 전건 지급 완료 또는 전건
                미지급 취소만 처리하세요. 일부 성공·결과 불명확 건은 기록하지
                말고 은행 결과를 먼저 대조하세요.
            </p>
            <label className="block text-sm">
                처리 결과
                <select
                    className="border-border mt-1 block rounded border p-2"
                    value={status}
                    disabled={pending}
                    onChange={(event) => {
                        setStatus(event.target.value as typeof status);
                        setConfirmed(false);
                    }}
                >
                    {fileIssued && (
                        <option value="COMPLETED">전건 지급 완료</option>
                    )}
                    <option value="CANCELLED">전건 미지급 취소</option>
                </select>
            </label>
            <label className="block text-sm">
                은행 결과·대조 기록 번호
                <input
                    className="border-border mt-1 block w-full rounded border p-2"
                    required
                    minLength={5}
                    maxLength={200}
                    value={reference}
                    disabled={pending}
                    onChange={(event) => setReference(event.target.value)}
                />
            </label>
            <label className="block text-sm">
                처리 사유 (계좌번호·개인정보 입력 금지)
                <textarea
                    className="border-border mt-1 block w-full rounded border p-2"
                    required
                    minLength={5}
                    maxLength={500}
                    value={reason}
                    disabled={pending}
                    onChange={(event) => setReason(event.target.value)}
                />
            </label>
            <label className="flex items-start gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={pending}
                    onChange={(event) => setConfirmed(event.target.checked)}
                />
                {status === "COMPLETED"
                    ? "모든 지급 대상과 금액의 은행 지급 성공을 확인했습니다."
                    : "지급된 건이 없고, 은행의 대기·예약 이체도 모두 취소되었음을 확인했습니다."}
            </label>
            <p className="text-muted-foreground text-xs">
                기록 후 상태를 되돌릴 수 없으며 배치의 전체 계좌번호가
                파기됩니다. 이 화면은 송금을 실행하거나 은행 이체를 취소하지
                않습니다.
            </p>
            <button
                className="bg-brand rounded-lg px-4 py-2 font-bold text-white disabled:opacity-50"
                disabled={!confirmed || pending}
            >
                {pending ? "기록 중…" : "결과 확정 기록"}
            </button>
            {message && (
                <p role="status" className="text-sm">
                    {message}
                </p>
            )}
        </form>
    );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function RefundControls({
    id,
    status,
    claimed,
}: {
    id: string;
    status: string;
    claimed: boolean;
}) {
    const router = useRouter();
    const [reason, setReason] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");
    async function run(action: string) {
        setPending(true);
        try {
            const response = await fetch("/api/admin/refunds", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    action,
                    reason,
                    confirm: confirmed,
                }),
            });
            const result = await response.json();
            setMessage(result.message);
            router.refresh();
        } catch {
            setMessage(
                "결과가 불확실합니다. 새로고침 후 조회만 수행해 주세요.",
            );
        } finally {
            setPending(false);
        }
    }
    return (
        <div className="mt-3 space-y-2">
            <label className="block">
                검토 사유 (5~500자)
                <input
                    className="block w-full rounded border p-2"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                />
            </label>
            {status === "PENDING" && !claimed ? (
                <>
                    <label className="flex gap-2">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        실제 제공시간·환불 금액을 확인했고 실제 환불 집행에
                        동의합니다.
                    </label>
                    <button
                        className="cursor-pointer rounded border px-4 py-2 disabled:cursor-not-allowed"
                        disabled={
                            pending || !confirmed || reason.trim().length < 5
                        }
                        onClick={() => run("approve")}
                    >
                        승인하고 환불
                    </button>
                </>
            ) : claimed ? (
                <button
                    className="cursor-pointer rounded border px-4 py-2 disabled:cursor-not-allowed"
                    disabled={pending || reason.trim().length < 5}
                    onClick={() => run("inspect")}
                >
                    결과 조회 및 기록 복구
                </button>
            ) : (
                <p>
                    기존 승인건은 PG 콘솔 대조가 필요합니다. 이 화면에서
                    재취소하지 않습니다.
                </p>
            )}
            <p role="status">{message}</p>
        </div>
    );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    getEvidenceRetention,
    manageEvidenceRetention,
    type EvidenceRetentionStatus,
} from "@/app/(partner)/partner/_actions/evidence-retention";

export function EvidenceRetentionControls({
    id,
    kind,
    admin,
}: {
    id: string;
    kind: "QUALIFICATION" | "HISTORY";
    admin: boolean;
}) {
    const [status, setStatus] = useState<EvidenceRetentionStatus | null>(null);
    const [reason, setReason] = useState("");
    const [pending, setPending] = useState(false);
    const refresh = async () => {
        const next = await getEvidenceRetention(id, kind);
        if (!next) toast.error("증빙 보유 상태를 조회하지 못했습니다.");
        setStatus(next);
    };
    const run = async (action: "appeal" | "hold" | "resolve" | "notify") => {
        setPending(true);
        try {
            const result = await manageEvidenceRetention(
                id,
                kind,
                action,
                reason,
            );
            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            toast.success("보유 및 이의신청 상태를 저장했습니다.");
            setReason("");
            await refresh();
        } catch {
            toast.error("처리하지 못했습니다. 다시 시도해 주세요.");
        } finally {
            setPending(false);
        }
    };
    return (
        <div className="mt-3 space-y-2 text-xs">
            <p>
                증빙 원본은 최초 심사 결과 통지 후 30일간 보관하며, 진행 중인
                이의신청은 처리 종료까지 파기를 보류합니다.
            </p>
            <button
                type="button"
                disabled={pending}
                className="cursor-pointer underline"
                onClick={async () => {
                    setPending(true);
                    try {
                        await refresh();
                    } catch {
                        toast.error("상태 조회 실패");
                    } finally {
                        setPending(false);
                    }
                }}
            >
                보유기간·이의신청 상태 확인
            </button>
            {status && (
                <>
                    <p>
                        {status.notifiedAt
                            ? `이의신청 기간 종료: ${new Date(status.expiresAt!).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
                            : "심사 결과 통지일 미확인. 심사 대기 또는 담당자 확인이 필요합니다."}
                    </p>
                    {status.unavailable ? (
                        <p>
                            보유기간 종료로 원본 열람을 차단했습니다. 자동 파기
                            대상이며 인증 정보는 유지됩니다.
                        </p>
                    ) : (
                        <>
                            {status.appealOpen && (
                                <p>이의신청 처리 중 · 원본 파기 보류</p>
                            )}
                            {(admin ||
                                (status.notifiedAt && !status.appealOpen)) && (
                                <>
                                    <label className="block">
                                        {admin
                                            ? "처리 사유 / 재통지할 심사 결과"
                                            : "이의신청 사유"}{" "}
                                        (5~500자)
                                        <textarea
                                            value={reason}
                                            maxLength={500}
                                            onChange={(e) =>
                                                setReason(e.target.value)
                                            }
                                            className="mt-1 block w-full rounded-lg border p-2"
                                        />
                                    </label>
                                    <p>
                                        환자 정보 등 불필요한 개인정보는
                                        입력하지 마세요.
                                    </p>
                                    <button
                                        type="button"
                                        disabled={
                                            pending || reason.trim().length < 5
                                        }
                                        className="cursor-pointer rounded border px-3 py-2 disabled:opacity-50"
                                        onClick={() =>
                                            void run(
                                                admin
                                                    ? !status.notifiedAt
                                                        ? "notify"
                                                        : status.appealOpen
                                                          ? "resolve"
                                                          : "hold"
                                                    : "appeal",
                                            )
                                        }
                                    >
                                        {admin
                                            ? !status.notifiedAt
                                                ? "기존 심사 결과 재통지"
                                                : status.appealOpen
                                                  ? "이의신청 처리 종료"
                                                  : "접수한 이의신청으로 파기 보류"
                                            : "이의신청 접수"}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

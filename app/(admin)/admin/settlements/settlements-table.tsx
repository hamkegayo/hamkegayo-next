"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AdminSettlement } from "./_lib/settlements.server";
import {
    approveSettlements,
    createTransferBatch,
    holdSettlements,
    releaseSettlements,
} from "./actions";

const LABEL = {
    PENDING: "검토 대기",
    HOLD: "보류",
    APPROVED: "승인",
    PAID: "지급 완료",
} as const;

const won = new Intl.NumberFormat("ko-KR");

export function SettlementsTable({ rows }: { rows: AdminSettlement[] }) {
    const [selected, setSelected] = useState<string[]>([]);
    const [pending, startTransition] = useTransition();

    const act = (
        kind: "approve" | "hold" | "release" | "batch",
        requestedIds = selected,
    ) => {
        const ids = requestedIds.filter((id) => {
            const row = rows.find((item) => item.id === id);
            if (!row) return false;
            if (kind === "approve") return row.status === "PENDING";
            if (kind === "batch")
                return row.status === "APPROVED" && !row.batchId;
            if (kind === "release") return row.status === "HOLD";
            return row.status === "PENDING" || row.status === "APPROVED";
        });
        if (ids.length === 0) {
            toast.error("선택한 상태에서 실행할 수 있는 정산 건이 없습니다.");
            return;
        }
        const reason = window.prompt("처리 사유를 5자 이상 입력해 주세요.");
        if (!reason) return;
        startTransition(async () => {
            const result =
                kind === "approve"
                    ? await approveSettlements(ids, reason)
                    : kind === "batch"
                      ? await createTransferBatch(ids, reason)
                      : kind === "hold"
                        ? await holdSettlements(ids, reason)
                        : await releaseSettlements(ids, reason);
            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            setSelected([]);
            toast.success(
                "code" in result
                    ? `${result.code} 배치를 만들었습니다.`
                    : `${result.count}건을 처리했습니다.`,
            );
        });
    };

    if (rows.length === 0)
        return (
            <p className="border-border text-muted-foreground mt-6 rounded-xl border border-dashed p-10 text-center text-sm">
                조건에 맞는 정산 건이 없습니다.
            </p>
        );

    const selectable = rows.filter((row) => row.status !== "PAID");
    return (
        <div className="mt-6">
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={pending || selected.length === 0}
                    onClick={() => act("approve")}
                    className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                    선택 일괄 승인
                </button>
                <button
                    type="button"
                    disabled={pending || selected.length === 0}
                    onClick={() => act("batch")}
                    className="border-brand text-brand rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                    선택 이체 배치 생성
                </button>
                <button
                    type="button"
                    disabled={pending || selected.length === 0}
                    onClick={() => act("hold")}
                    className="border-border rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                    선택 보류
                </button>
                <button
                    type="button"
                    disabled={pending || selected.length === 0}
                    onClick={() => act("release")}
                    className="border-border rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                    선택 보류 해제
                </button>
            </div>
            <div className="border-border mt-3 overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[1000px] text-left text-sm">
                    <thead className="bg-muted/60">
                        <tr>
                            <th className="p-3">
                                <input
                                    type="checkbox"
                                    aria-label="전체 선택"
                                    checked={
                                        selectable.length > 0 &&
                                        selectable.every((row) =>
                                            selected.includes(row.id),
                                        )
                                    }
                                    onChange={(event) =>
                                        setSelected(
                                            event.target.checked
                                                ? selectable.map(
                                                      (row) => row.id,
                                                  )
                                                : [],
                                        )
                                    }
                                />
                            </th>
                            <th className="p-3">이용일·예약</th>
                            <th className="p-3">파트너</th>
                            <th className="p-3 text-right">총액</th>
                            <th className="p-3 text-right">공제</th>
                            <th className="p-3 text-right">지급액</th>
                            <th className="p-3">준비 상태</th>
                            <th className="p-3">상태</th>
                            <th className="p-3">이체 배치</th>
                            <th className="p-3">처리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-border divide-y">
                        {rows.map((row) => (
                            <tr key={row.id}>
                                <td className="p-3">
                                    {row.status !== "PAID" && (
                                        <input
                                            type="checkbox"
                                            aria-label={`${row.reservationCode} 선택`}
                                            checked={selected.includes(row.id)}
                                            onChange={(event) =>
                                                setSelected((current) =>
                                                    event.target.checked
                                                        ? [...current, row.id]
                                                        : current.filter(
                                                              (id) =>
                                                                  id !== row.id,
                                                          ),
                                                )
                                            }
                                        />
                                    )}
                                </td>
                                <td className="p-3">
                                    <strong>{row.useDate}</strong>
                                    <p className="text-muted-foreground text-xs">
                                        {row.reservationCode}
                                    </p>
                                </td>
                                <td className="p-3">{row.partnerName}</td>
                                <td className="p-3 text-right">
                                    {won.format(row.amount)}원
                                </td>
                                <td className="p-3 text-right">
                                    {won.format(row.fee)}원
                                </td>
                                <td className="p-3 text-right font-bold">
                                    {won.format(row.net)}원
                                </td>
                                <td className="p-3 text-xs">
                                    <p>
                                        {row.paymentReady
                                            ? "결제 확인"
                                            : "결제 미확인"}
                                    </p>
                                    <p>
                                        {row.hasPayoutAccount
                                            ? "계좌 등록"
                                            : "계좌 미등록"}
                                    </p>
                                </td>
                                <td className="p-3 font-semibold">
                                    {LABEL[row.status]}
                                </td>
                                <td className="p-3 text-xs">
                                    {row.batchCode ?? "-"}
                                </td>
                                <td className="p-3">
                                    {row.status === "HOLD" ? (
                                        <button
                                            type="button"
                                            disabled={pending}
                                            onClick={() =>
                                                act("release", [row.id])
                                            }
                                            className="text-brand font-bold underline"
                                        >
                                            보류 해제
                                        </button>
                                    ) : row.status !== "PAID" ? (
                                        <button
                                            type="button"
                                            disabled={pending}
                                            onClick={() =>
                                                act("hold", [row.id])
                                            }
                                            className="font-bold underline"
                                        >
                                            보류
                                        </button>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

"use client";

import { X } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { type Settlement } from "../_lib/settlement";

function Row({
    label,
    value,
    valueClass,
}: {
    label: string;
    value: React.ReactNode;
    valueClass?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={valueClass ?? "text-foreground font-bold"}>
                {value}
            </span>
        </div>
    );
}

export function SettlementDetailModal({
    open,
    onClose,
    settlement,
}: {
    open: boolean;
    onClose: () => void;
    settlement: Settlement | null;
}) {
    if (!settlement) return null;

    const isPaid = settlement.status === "paid";

    return (
        <Modal open={open} onClose={onClose} className="max-w-md">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-foreground text-lg font-extrabold">
                        정산 상세
                    </h3>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                        {settlement.id}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
                >
                    <X className="size-5" />
                </button>
            </div>

            <div className="divide-border mt-4 divide-y">
                <Row label="서비스 일자" value={settlement.serviceDate} />
                <Row
                    label="서비스 내용"
                    value={`${settlement.hospital} 동행 (${settlement.plan})`}
                />
                <Row
                    label="정산 상태"
                    value={
                        <span
                            className={
                                isPaid
                                    ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:bg-emerald-500/15"
                                    : "bg-brand/10 text-brand rounded-full px-2.5 py-1 text-xs font-bold"
                            }
                        >
                            {isPaid ? "지급 완료" : "지급 예정"}
                        </span>
                    }
                    valueClass=""
                />
                <Row label="정산일" value={settlement.settledDate ?? "-"} />
            </div>

            <div className="divide-border border-border mt-3 divide-y border-t pt-1">
                <Row
                    label="서비스 금액"
                    value={
                        settlement.grossAmount
                            ? `${settlement.grossAmount.toLocaleString()}원`
                            : "-"
                    }
                />
                <Row
                    label="플랫폼 수수료"
                    value={
                        settlement.fee
                            ? `-${settlement.fee.toLocaleString()}원`
                            : "-"
                    }
                />
                <Row
                    label="실지급액"
                    value={
                        settlement.amount
                            ? `${settlement.amount.toLocaleString()}원`
                            : "-"
                    }
                    valueClass="text-base font-extrabold text-brand"
                />
            </div>

            <div className="mt-5 flex gap-3">
                <button
                    type="button"
                    onClick={() => toast.success("명세서를 발송했습니다.")}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    명세서 받기
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    확인
                </button>
            </div>
        </Modal>
    );
}

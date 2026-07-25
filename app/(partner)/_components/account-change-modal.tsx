"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

const inputCls =
    "mt-1.5 w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

export function AccountChangeModal({
    open,
    onClose,
    onChange,
}: {
    open: boolean;
    onClose: () => void;
    onChange: (bank: string, account: string, holder: string) => void;
}) {
    const [bank, setBank] = useState("");
    const [account, setAccount] = useState("");
    const [holder, setHolder] = useState("");

    const valid = bank.trim() && account.trim() && holder.trim();

    const close = () => {
        setBank("");
        setAccount("");
        setHolder("");
        onClose();
    };

    const submit = () => {
        if (!valid) return;
        onChange(bank.trim(), account.trim(), holder.trim());
        close();
    };

    return (
        <Modal open={open} onClose={close} className="max-w-md">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    정산 계좌 변경
                </h3>
                <button
                    type="button"
                    onClick={close}
                    aria-label="닫기"
                    className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
                >
                    <X className="size-5" />
                </button>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
                정산금을 받을 계좌를 변경합니다. 예금주는 본인 명의여야 합니다.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
                <div>
                    <label className="text-foreground text-sm font-bold">
                        은행
                    </label>
                    <input
                        type="text"
                        value={bank}
                        onChange={(e) => setBank(e.target.value)}
                        className={inputCls}
                    />
                </div>
                <div>
                    <label className="text-foreground text-sm font-bold">
                        계좌번호
                    </label>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={account}
                        onChange={(e) => setAccount(e.target.value)}
                        className={inputCls}
                    />
                </div>
            </div>

            <div className="mt-4">
                <label className="text-foreground text-sm font-bold">
                    예금주
                </label>
                <input
                    type="text"
                    value={holder}
                    onChange={(e) => setHolder(e.target.value)}
                    className={inputCls}
                />
            </div>

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={close}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!valid}
                    className={cn(
                        "flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors",
                        valid
                            ? "bg-brand text-brand-foreground hover:bg-brand/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                    )}
                >
                    변경하기
                </button>
            </div>
        </Modal>
    );
}

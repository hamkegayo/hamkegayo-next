"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import {
    ACCOUNT_MAX_LEN,
    ACCOUNT_MIN_LEN,
    BANKS,
    normalizeAccountNumber,
} from "@/lib/banks";
import { savePayoutAccount } from "../partner/_actions/payout-account";

/**
 * 정산 계좌 등록·변경 (#51).
 *
 *  전에는 이 모달이 **화면 문자열만 바꾸고 "변경되었습니다" 를 띄웠다.**
 *  저장되는 곳이 없었으므로 파트너는 등록됐다고 믿은 채 정산일을 맞았다.
 *
 *  ⚠️ 입력한 계좌번호는 저장 뒤 **다시 조회되지 않는다.** 화면은 뒷 4자리만
 *     받는다. 그래서 수정 모드에서도 기존 번호를 미리 채워 주지 않는다 —
 *     바꾸려면 전체를 다시 입력한다.
 *
 *  호출부가 열 때마다 새로 마운트한다(`{open && <AccountChangeModal …>}`).
 *  effect 로 초기화하는 대신 마운트에 맡기는 편이 확실하다 — 계좌번호가
 *  닫은 화면에 남아 있으면 안 된다.
 */

const inputCls =
    "mt-1.5 w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

export function AccountChangeModal({
    open,
    onClose,
    onSaved,
    /** 이미 등록돼 있으면 예금주만 프리필한다. 계좌번호는 채우지 않는다. */
    defaultHolder,
    defaultBankCode,
}: {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    defaultHolder?: string;
    defaultBankCode?: string;
}) {
    const [bankCode, setBankCode] = useState(defaultBankCode ?? "");
    const [account, setAccount] = useState("");
    const [holder, setHolder] = useState(defaultHolder ?? "");
    const [pending, startTransition] = useTransition();

    const digits = normalizeAccountNumber(account);
    const valid =
        !!bankCode &&
        digits.length >= ACCOUNT_MIN_LEN &&
        digits.length <= ACCOUNT_MAX_LEN &&
        holder.trim().length >= 2;

    const close = () => {
        if (pending) return;
        onClose();
    };

    const submit = () => {
        if (!valid || pending) return;
        startTransition(async () => {
            const res = await savePayoutAccount({
                bankCode,
                accountNumber: digits,
                holderName: holder.trim(),
            });
            if (res.ok) {
                toast.success(`정산 계좌를 등록했습니다. (****${res.last4})`);
                onSaved();
                onClose();
            } else {
                toast.error(res.message);
            }
        });
    };

    return (
        <Modal open={open} onClose={close} className="max-w-md">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    정산 계좌 등록
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
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                정산금을 받을 계좌입니다. 예금주가 본인 명의가 아니면 이체가
                실패합니다.
            </p>

            <div className="mt-5">
                <label
                    htmlFor="payout-bank"
                    className="text-foreground text-sm font-bold"
                >
                    은행
                </label>
                <select
                    id="payout-bank"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    className={inputCls}
                >
                    <option value="">은행을 선택해 주세요</option>
                    {BANKS.map((b) => (
                        <option key={b.code} value={b.code}>
                            {b.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mt-4">
                <label
                    htmlFor="payout-account"
                    className="text-foreground text-sm font-bold"
                >
                    계좌번호
                </label>
                <input
                    id="payout-account"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder="'-' 없이 숫자만 입력"
                    className={inputCls}
                />
                {digits.length > 0 && digits.length < ACCOUNT_MIN_LEN && (
                    <p className="text-destructive mt-1.5 text-xs">
                        계좌번호는 {ACCOUNT_MIN_LEN}자리 이상입니다.
                    </p>
                )}
            </div>

            <div className="mt-4">
                <label
                    htmlFor="payout-holder"
                    className="text-foreground text-sm font-bold"
                >
                    예금주
                </label>
                <input
                    id="payout-holder"
                    type="text"
                    autoComplete="off"
                    value={holder}
                    onChange={(e) => setHolder(e.target.value)}
                    placeholder="통장에 표기된 이름 그대로"
                    className={inputCls}
                />
            </div>

            <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
                등록하신 계좌번호는 저장 후 다시 표시되지 않으며, 뒷 4자리만
                확인하실 수 있습니다. 전체 번호는 정산 이체 시점에 담당자가
                열람하며 열람 기록이 남습니다.
            </p>

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!valid || pending}
                    className={cn(
                        "flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors",
                        valid && !pending
                            ? "bg-brand text-brand-foreground hover:bg-brand/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                    )}
                >
                    {pending ? "저장 중…" : "등록하기"}
                </button>
            </div>
        </Modal>
    );
}

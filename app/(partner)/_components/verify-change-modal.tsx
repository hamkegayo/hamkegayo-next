"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";

/** 연락처/이메일 인증 변경 공통 모달 */
export function VerifyChangeModal({
    open,
    onClose,
    kind,
}: {
    open: boolean;
    onClose: () => void;
    kind: "연락처" | "이메일";
}) {
    const [value, setValue] = useState("");
    const [code, setCode] = useState("");

    const close = () => {
        setValue("");
        setCode("");
        onClose();
    };

    const description =
        kind === "연락처"
            ? "변경할 휴대폰 번호로 인증번호를 보내드립니다."
            : "변경할 이메일로 인증번호를 보내드립니다.";

    return (
        <Modal open={open} onClose={close} className="max-w-sm">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    {kind} 인증 변경
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
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>

            <label className="text-foreground mt-5 block text-sm font-bold">
                새 {kind}
            </label>
            <input
                type={kind === "이메일" ? "email" : "tel"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
            />

            <label className="text-foreground mt-4 block text-sm font-bold">
                인증번호
            </label>
            <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="인증번호 6자리"
                className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
            />

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={() => toast.success("인증번호를 발송했습니다.")}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    인증번호 발송
                </button>
                <button
                    type="button"
                    onClick={() => {
                        toast.success(`${kind} 인증이 완료되었습니다.`);
                        close();
                    }}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    인증 완료
                </button>
            </div>
        </Modal>
    );
}

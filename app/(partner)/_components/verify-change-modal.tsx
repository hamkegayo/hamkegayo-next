"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { requestEmailCode, verifyEmailCode } from "@/app/(user)/_actions/email";
import { Modal } from "@/components/ui/modal";

const CODE_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

type ChangeResult = { ok: true } | { ok: false; message: string };

function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** OTP 인증과 실제 연락용 이메일 변경을 한 흐름으로 처리한다. */
export function VerifyChangeModal({
    open,
    onClose,
    onVerified,
}: {
    open: boolean;
    onClose: () => void;
    onVerified: (email: string) => Promise<ChangeResult>;
}) {
    const [value, setValue] = useState("");
    const [code, setCode] = useState("");
    const [sent, setSent] = useState(false);
    const [expiresIn, setExpiresIn] = useState(0);
    const [cooldown, setCooldown] = useState(0);
    const [pending, setPending] = useState<"request" | "verify" | null>(null);

    useEffect(() => {
        if (!open || (!expiresIn && !cooldown)) return;
        const timer = window.setInterval(() => {
            setExpiresIn((previous) => {
                if (previous <= 1) {
                    setSent(false);
                    return 0;
                }
                return previous - 1;
            });
            setCooldown((previous) => Math.max(0, previous - 1));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [open, expiresIn, cooldown]);

    const close = () => {
        setValue("");
        setCode("");
        setSent(false);
        setExpiresIn(0);
        setCooldown(0);
        setPending(null);
        onClose();
    };

    const handleRequest = async () => {
        if (pending || cooldown > 0) return;
        setPending("request");
        try {
            const result = await requestEmailCode(value);
            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            setCode("");
            setSent(true);
            setExpiresIn(CODE_TTL_SECONDS);
            setCooldown(RESEND_COOLDOWN_SECONDS);
            if (result.devCode) {
                toast.info(`개발용 인증번호: ${result.devCode}`, {
                    duration: 10000,
                });
            } else {
                toast.success(
                    "인증번호를 발송했습니다. 메일함을 확인해 주세요.",
                );
            }
        } finally {
            setPending(null);
        }
    };

    const handleVerify = async () => {
        if (pending || !sent || code.length !== 6) return;
        setPending("verify");
        try {
            const verified = await verifyEmailCode(value, code);
            if (!verified.ok) {
                toast.error(verified.message);
                return;
            }
            const changed = await onVerified(value);
            if (!changed.ok) {
                toast.error(changed.message);
                return;
            }
            toast.success("이메일이 변경되었습니다.");
            close();
        } finally {
            setPending(null);
        }
    };

    return (
        <Modal open={open} onClose={close} className="max-w-sm">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    이메일 인증 변경
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
                변경할 이메일로 인증번호를 보내드립니다.
            </p>

            <label className="text-foreground mt-5 block text-sm font-bold">
                새 이메일
            </label>
            <input
                type="email"
                autoComplete="email"
                value={value}
                onChange={(e) => {
                    setValue(e.target.value);
                    if (sent) {
                        setCode("");
                        setSent(false);
                        setExpiresIn(0);
                    }
                }}
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
                disabled={!sent || pending === "verify"}
                className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
            />
            <p className="text-muted-foreground mt-1 text-right text-xs">
                {sent
                    ? `인증번호 유효시간 ${formatTime(expiresIn)}`
                    : "인증번호는 5분간 유효합니다."}
            </p>

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={handleRequest}
                    disabled={!!pending || cooldown > 0}
                    aria-busy={pending === "request"}
                    className="border-border bg-background text-foreground hover:bg-muted inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50"
                >
                    {pending === "request" && (
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                    )}
                    {pending === "request"
                        ? "발송 중…"
                        : cooldown > 0
                          ? `${cooldown}초 후 재발송`
                          : "인증번호 발송"}
                </button>
                <button
                    type="button"
                    onClick={handleVerify}
                    disabled={!!pending || !sent || code.length !== 6}
                    aria-busy={pending === "verify"}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50"
                >
                    {pending === "verify" && (
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                    )}
                    {pending === "verify" ? "확인 중…" : "인증 완료"}
                </button>
            </div>
        </Modal>
    );
}

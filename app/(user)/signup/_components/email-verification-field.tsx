"use client";

import { useEffect, useRef, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestEmailCode, verifyEmailCode } from "@/app/(user)/_actions/email";

// OTP 유효시간(초) — 서버 CODE_TTL_MS(5분)와 일치
const COUNTDOWN_SECONDS = 5 * 60;

function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
    emailField: UseFormRegisterReturn;
    emailValue: string;
    verified: boolean;
    onVerified: (value: boolean) => void;
    emailError?: string;
    verifyError?: string;
};

export function EmailVerificationField({
    emailField,
    emailValue,
    verified,
    onVerified,
    emailError,
    verifyError,
}: Props) {
    const [code, setCode] = useState("");
    const [sent, setSent] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 카운트다운
    useEffect(() => {
        if (!sent || verified) return;
        timerRef.current = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setSent(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [sent, verified]);

    const handleRequest = async () => {
        if (requesting) return;
        setRequesting(true);
        try {
            const res = await requestEmailCode(emailValue);
            if (!res.ok) {
                toast.error(res.message);
                return;
            }
            onVerified(false);
            setCode("");
            setSent(true);
            setSecondsLeft(COUNTDOWN_SECONDS);
            // 개발 모드: 실제 메일 대신 코드 확인용
            if (res.devCode) {
                toast.info(`개발용 인증번호: ${res.devCode}`, {
                    duration: 10000,
                });
            } else {
                toast.success(
                    "인증번호를 발송했습니다. 메일함을 확인해 주세요.",
                );
            }
        } finally {
            setRequesting(false);
        }
    };

    const handleVerify = async () => {
        if (verifying) return;
        setVerifying(true);
        try {
            const res = await verifyEmailCode(emailValue, code);
            if (!res.ok) {
                toast.error(res.message);
                return;
            }
            onVerified(true);
            setSent(false);
            toast.success("이메일 인증이 완료되었습니다.");
        } finally {
            setVerifying(false);
        }
    };

    const showCountdown = sent && !verified && secondsLeft > 0;

    return (
        <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>

            {/* 이메일 + 인증요청 */}
            <div className="flex gap-2">
                <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    aria-invalid={!!emailError}
                    disabled={verified}
                    {...emailField}
                />
                <button
                    type="button"
                    onClick={handleRequest}
                    disabled={verified || requesting}
                    className="bg-brand/10 text-brand hover:bg-brand/20 shrink-0 rounded-lg px-4 text-sm font-bold transition-colors disabled:opacity-50"
                >
                    인증요청
                </button>
            </div>
            {emailError && (
                <p className="text-destructive text-sm">{emailError}</p>
            )}

            {/* 인증번호 + 인증확인 */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="인증번호를 입력해주세요"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        disabled={verified || !sent}
                        aria-invalid={!!verifyError}
                        className="pr-14"
                    />
                    {showCountdown && (
                        <span className="text-destructive absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold">
                            {formatTime(secondsLeft)}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verified || !sent || !code}
                    className="bg-brand/10 text-brand hover:bg-brand/20 shrink-0 rounded-lg px-4 text-sm font-bold transition-colors disabled:opacity-50"
                >
                    인증확인
                </button>
            </div>
            {verified ? (
                <p className="text-brand text-sm font-medium">
                    이메일 인증이 완료되었습니다.
                </p>
            ) : (
                verifyError && (
                    <p className="text-destructive text-sm">{verifyError}</p>
                )
            )}
        </div>
    );
}

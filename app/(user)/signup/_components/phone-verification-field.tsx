"use client";

import { useEffect, useRef, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPhoneCode, verifyPhoneCode } from "@/app/(user)/_actions/phone";

// OTP 유효시간(초) — 서버 CODE_TTL_MS(5분)와 일치
const COUNTDOWN_SECONDS = 5 * 60;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  phoneField: UseFormRegisterReturn;
  phoneValue: string;
  verified: boolean;
  onVerified: (value: boolean) => void;
  phoneError?: string;
  verifyError?: string;
};

export function PhoneVerificationField({
  phoneField,
  phoneValue,
  verified,
  onVerified,
  phoneError,
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
      const res = await requestPhoneCode(phoneValue);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      onVerified(false);
      setCode("");
      setSent(true);
      setSecondsLeft(COUNTDOWN_SECONDS);
      // 개발 모드: 실제 문자 대신 코드 확인용
      if (res.devCode) {
        toast.info(`개발용 인증번호: ${res.devCode}`, { duration: 10000 });
      } else {
        toast.success("인증번호를 발송했습니다.");
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleVerify = async () => {
    if (verifying) return;
    setVerifying(true);
    try {
      const res = await verifyPhoneCode(phoneValue, code);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      onVerified(true);
      setSent(false);
      toast.success("휴대폰 인증이 완료되었습니다.");
    } finally {
      setVerifying(false);
    }
  };

  const showCountdown = sent && !verified && secondsLeft > 0;

  return (
    <div className="space-y-2">
      <Label htmlFor="phone">휴대폰번호</Label>

      {/* 휴대폰번호 + 인증요청 */}
      <div className="flex gap-2">
        <Input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="휴대폰번호를 입력해 주세요"
          aria-invalid={!!phoneError}
          disabled={verified}
          {...phoneField}
        />
        <button
          type="button"
          onClick={handleRequest}
          disabled={verified || requesting}
          className="shrink-0 rounded-lg bg-brand/10 px-4 text-sm font-bold text-brand transition-colors hover:bg-brand/20 disabled:opacity-50"
        >
          인증요청
        </button>
      </div>
      {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}

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
            <span className="absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-destructive">
              {formatTime(secondsLeft)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={verified || !sent || !code}
          className="shrink-0 rounded-lg bg-brand/10 px-4 text-sm font-bold text-brand transition-colors hover:bg-brand/20 disabled:opacity-50"
        >
          인증확인
        </button>
      </div>
      {verified ? (
        <p className="text-sm font-medium text-brand">휴대폰 인증이 완료되었습니다.</p>
      ) : (
        verifyError && <p className="text-sm text-destructive">{verifyError}</p>
      )}
    </div>
  );
}

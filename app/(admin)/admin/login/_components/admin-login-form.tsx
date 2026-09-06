"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    cancelAdminLogin,
    enrollTotp,
    loginAdmin,
    verifyTotp,
} from "../_lib/actions";

type Step =
    | { name: "credentials" }
    | { name: "enroll"; factorId: string; qr: string; secret: string }
    | { name: "verify" };

export function AdminLoginForm() {
    const router = useRouter();
    const [step, setStep] = useState<Step>({ name: "credentials" });
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);

    const submitCredentials = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
            const res = await loginAdmin({ email, password });
            if (!res.ok) {
                toast.error(res.message);
                return;
            }
            if (res.next === "verify") {
                setStep({ name: "verify" });
                return;
            }
            const enrolled = await enrollTotp();
            if (!enrolled.ok) {
                toast.error(enrolled.message);
                return;
            }
            setStep({
                name: "enroll",
                factorId: enrolled.factorId,
                qr: enrolled.qr,
                secret: enrolled.secret,
            });
        } finally {
            setBusy(false);
        }
    };

    const submitCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
            const res = await verifyTotp({
                factorId: step.name === "enroll" ? step.factorId : undefined,
                code,
            });
            if (!res.ok) {
                toast.error(res.message);
                setCode("");
                return;
            }
            router.replace(res.redirectTo);
            router.refresh();
        } finally {
            setBusy(false);
        }
    };

    const cancel = async () => {
        await cancelAdminLogin();
        setStep({ name: "credentials" });
        setPassword("");
        setCode("");
        router.refresh();
    };

    return (
        <div className="border-border bg-background mx-auto w-full max-w-md rounded-2xl border p-7 md:p-8">
            <div className="flex items-center gap-2">
                <ShieldCheck className="text-muted-foreground size-5" />
                <h1 className="text-foreground text-xl font-extrabold">
                    관리자 로그인
                </h1>
            </div>

            {step.name === "credentials" && (
                <form onSubmit={submitCredentials} className="mt-7 space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="admin-email">이메일</Label>
                        <Input
                            id="admin-email"
                            type="email"
                            autoComplete="username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="admin-password">비밀번호</Label>
                        <Input
                            id="admin-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={busy}
                        className="bg-foreground text-background flex h-11 w-full items-center justify-center gap-2 rounded-lg font-bold disabled:opacity-60"
                    >
                        {busy && <Loader2 className="size-4 animate-spin" />}
                        다음
                    </button>
                </form>
            )}

            {step.name === "enroll" && (
                <div className="mt-7">
                    <p className="text-muted-foreground text-sm">
                        인증 앱(Google Authenticator 등)으로 아래 QR 을 스캔한
                        뒤, 표시되는 6자리 숫자를 입력해 주세요.
                    </p>
                    {/* enroll 응답의 QR 은 Supabase 가 만든 data:image/svg+xml 문자열이다 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={step.qr}
                        alt="2단계 인증 QR 코드"
                        className="border-border mx-auto mt-5 size-48 rounded-lg border bg-white p-2"
                    />
                    <p className="text-muted-foreground mt-4 text-center text-xs break-all">
                        QR 을 못 읽으면 이 키를 직접 입력하세요
                        <br />
                        <span className="text-foreground font-mono font-semibold">
                            {step.secret}
                        </span>
                    </p>
                    <CodeForm
                        code={code}
                        setCode={setCode}
                        busy={busy}
                        onSubmit={submitCode}
                        onCancel={cancel}
                        label="등록 완료"
                    />
                </div>
            )}

            {step.name === "verify" && (
                <div className="mt-7">
                    <p className="text-muted-foreground text-sm">
                        인증 앱에 표시된 6자리 숫자를 입력해 주세요.
                    </p>
                    <CodeForm
                        code={code}
                        setCode={setCode}
                        busy={busy}
                        onSubmit={submitCode}
                        onCancel={cancel}
                        label="로그인"
                    />
                </div>
            )}
        </div>
    );
}

function CodeForm({
    code,
    setCode,
    busy,
    onSubmit,
    onCancel,
    label,
}: {
    code: string;
    setCode: (v: string) => void;
    busy: boolean;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
    label: string;
}) {
    return (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
                <Label htmlFor="admin-code">인증 코드</Label>
                <Input
                    id="admin-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="text-center font-mono text-lg tracking-[0.4em]"
                    required
                />
            </div>
            <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="bg-foreground text-background flex h-11 w-full items-center justify-center gap-2 rounded-lg font-bold disabled:opacity-60"
            >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {label}
            </button>
            <button
                type="button"
                onClick={onCancel}
                className="text-muted-foreground hover:text-foreground w-full text-sm"
            >
                처음으로
            </button>
        </form>
    );
}

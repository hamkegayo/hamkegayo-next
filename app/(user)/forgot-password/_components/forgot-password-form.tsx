"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { PASSWORD_RULE_MESSAGE } from "@/lib/password";
import { requestPasswordReset, resetPassword } from "../_lib/actions";

type Step = "email" | "verify";

const labelCls = "text-foreground mb-1.5 block text-sm font-semibold";
const errorCls = "text-destructive mt-1.5 text-sm";

export function ForgotPasswordForm() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("email");
    const [pending, start] = useTransition();

    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [error, setError] = useState("");

    const onRequest = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        start(async () => {
            const res = await requestPasswordReset(email);
            if (!res.ok) {
                setError(res.message);
                return;
            }
            // 가입 여부를 알려주지 않는다 — 계정이 없어도 같은 안내를 보여준다.
            setStep("verify");
        });
    };

    const onReset = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== passwordConfirm) {
            setError("비밀번호가 일치하지 않습니다.");
            return;
        }

        start(async () => {
            const res = await resetPassword(email, code, password);
            if (!res.ok) {
                setError(res.message);
                return;
            }
            toast.success(
                "비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.",
            );
            router.push("/login");
        });
    };

    return (
        <div className="mx-auto w-full max-w-md">
            <h1 className="text-foreground text-2xl font-extrabold">
                비밀번호 찾기
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                가입하신 이메일로 인증번호를 보내드립니다.
            </p>

            {step === "email" ? (
                <form onSubmit={onRequest} noValidate className="mt-8">
                    <label htmlFor="email" className={labelCls}>
                        이메일
                    </label>
                    <Input
                        id="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="example@hamkegayo.kr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-invalid={!!error}
                    />
                    {error && <p className={errorCls}>{error}</p>}

                    <button
                        type="submit"
                        disabled={pending || !email}
                        aria-busy={pending}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-bold transition-colors disabled:opacity-60"
                    >
                        {pending && (
                            <Loader2
                                aria-hidden
                                className="size-5 animate-spin"
                            />
                        )}
                        {pending ? "보내는 중…" : "인증번호 받기"}
                    </button>
                </form>
            ) : (
                <form onSubmit={onReset} noValidate className="mt-8">
                    {/*
                      계정이 없어도 이 화면으로 넘어온다. 가입 여부가 응답으로
                      드러나면 이 화면이 가입자 이메일을 확인하는 도구가 된다.
                    */}
                    <p className="bg-muted/40 text-muted-foreground rounded-lg px-4 py-3 text-sm leading-relaxed">
                        <span className="text-foreground font-semibold">
                            {email}
                        </span>
                        {" 으로 인증번호를 보냈습니다. 5분 안에 입력해 주세요."}
                        <br />
                        메일이 오지 않으면 가입되지 않은 주소이거나 스팸함에
                        있을 수 있습니다.
                    </p>

                    <div className="mt-6">
                        <label htmlFor="code" className={labelCls}>
                            인증번호
                        </label>
                        <Input
                            id="code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="6자리 숫자"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                        />
                    </div>

                    <div className="mt-5">
                        <label htmlFor="password" className={labelCls}>
                            새 비밀번호
                        </label>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="new-password"
                            placeholder={PASSWORD_RULE_MESSAGE}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div className="mt-5">
                        <label htmlFor="passwordConfirm" className={labelCls}>
                            새 비밀번호 확인
                        </label>
                        <Input
                            id="passwordConfirm"
                            type="password"
                            autoComplete="new-password"
                            value={passwordConfirm}
                            onChange={(e) => setPasswordConfirm(e.target.value)}
                        />
                    </div>

                    {error && <p className={errorCls}>{error}</p>}

                    <button
                        type="submit"
                        disabled={pending || !code || !password}
                        aria-busy={pending}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-bold transition-colors disabled:opacity-60"
                    >
                        {pending && (
                            <Loader2
                                aria-hidden
                                className="size-5 animate-spin"
                            />
                        )}
                        {pending ? "변경 중…" : "비밀번호 변경"}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setStep("email");
                            setCode("");
                            setError("");
                        }}
                        className="text-muted-foreground hover:text-foreground mt-4 w-full text-sm font-semibold transition-colors"
                    >
                        이메일 다시 입력
                    </button>
                </form>
            )}

            <div className="text-foreground mt-8 flex items-center justify-center gap-4 text-sm font-semibold">
                <Link
                    href="/login"
                    className="hover:text-brand transition-colors"
                >
                    로그인
                </Link>
                <Link
                    href="/signup"
                    className="hover:text-brand transition-colors"
                >
                    회원가입
                </Link>
            </div>

            {/*
              파트너는 합성 이메일({login_id}@partner.hamkegayo.internal)이라
              메일이 닿지 않는다. 여기서 시도하다 막히지 않게 미리 알린다.
            */}
            <p className="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
                파트너 계정은 이 화면에서 재설정할 수 없습니다.
                <br />
                고객센터로 문의해 주세요.
            </p>
        </div>
    );
}

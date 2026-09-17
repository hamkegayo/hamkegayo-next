"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

export function PartnerAccountForm() {
    const [loginId, setLoginId] = useState("");
    const [reason, setReason] = useState("");
    const [issued, setIssued] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    return (
        <form
            className="border-border bg-background mt-6 max-w-xl space-y-4 rounded-2xl border p-6"
            onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                    const response = await fetch(
                        "/api/admin/accounts/partner",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ loginId, reason }),
                        },
                    );
                    const result = (await response.json()) as {
                        loginId?: string;
                        message?: string;
                    };
                    if (!response.ok || !result.loginId) {
                        toast.error(
                            result.message ?? "계정 발급에 실패했습니다.",
                        );
                        return;
                    }
                    setIssued(result.loginId);
                    setLoginId("");
                    setReason("");
                    toast.success("파트너 발급 아이디를 생성했습니다.");
                });
            }}
        >
            <div>
                <label htmlFor="login-id" className="text-sm font-semibold">
                    파트너 로그인 아이디
                </label>
                <input
                    id="login-id"
                    value={loginId}
                    onChange={(event) =>
                        setLoginId(event.target.value.toLowerCase())
                    }
                    pattern="[a-z0-9][a-z0-9._-]{3,31}"
                    minLength={4}
                    maxLength={32}
                    required
                    disabled={pending}
                    className="border-input bg-background mt-2 w-full rounded-lg border px-3.5 py-2"
                    placeholder="partner01"
                />
                <p className="text-description-foreground mt-1 text-xs">
                    영문 대문자는 입력 즉시 소문자로 변환됩니다. 영문·숫자로
                    시작하며 점, 밑줄, 하이픈을 사용할 수 있습니다.
                </p>
            </div>
            <div>
                <label htmlFor="issue-reason" className="text-sm font-semibold">
                    발급 사유 (5~500자)
                </label>
                <textarea
                    id="issue-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    minLength={5}
                    maxLength={500}
                    required
                    disabled={pending}
                    className="border-input bg-background mt-2 w-full rounded-lg border p-3"
                />
            </div>
            <button
                disabled={pending}
                className="bg-brand text-brand-foreground rounded-lg px-5 py-2.5 font-bold disabled:opacity-50"
            >
                {pending ? "발급 중…" : "발급 아이디 생성"}
            </button>
            {issued && (
                <div
                    role="status"
                    className="bg-muted/50 rounded-xl p-4 text-sm"
                >
                    발급 아이디: <strong>{issued}</strong>
                    <br />
                    파트너에게 회원가입 화면의 파트너 탭에서 본인 이메일 인증과
                    비밀번호 설정을 진행하도록 안내해 주세요.
                </div>
            )}
        </form>
    );
}

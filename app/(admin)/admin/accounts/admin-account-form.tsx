"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

const DUTIES = ["계정", "심사", "정산", "전체"] as const;

type IssuedAccount = {
    email: string;
    temporaryPassword: string;
};

export function AdminAccountForm() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [duty, setDuty] = useState<(typeof DUTIES)[number]>("심사");
    const [reason, setReason] = useState("");
    const [issued, setIssued] = useState<IssuedAccount | null>(null);
    const [pending, startTransition] = useTransition();

    return (
        <form
            className="border-border bg-background mt-6 max-w-xl space-y-4 rounded-2xl border p-6"
            onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                    const response = await fetch("/api/admin/accounts/admin", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, email, duty, reason }),
                    });
                    const result =
                        (await response.json()) as Partial<IssuedAccount> & {
                            message?: string;
                        };
                    if (
                        !response.ok ||
                        !result.email ||
                        !result.temporaryPassword
                    ) {
                        toast.error(
                            result.message ??
                                "관리자 계정 발급에 실패했습니다.",
                        );
                        return;
                    }
                    setIssued({
                        email: result.email,
                        temporaryPassword: result.temporaryPassword,
                    });
                    setName("");
                    setEmail("");
                    setReason("");
                    toast.success("관리자 전용 계정을 발급했습니다.");
                });
            }}
        >
            <div>
                <h2 className="text-lg font-bold">관리자 계정 발급</h2>
                <p className="text-description-foreground mt-1 text-sm">
                    임시 비밀번호는 발급 직후 한 번만 표시됩니다. 수신자는 첫
                    로그인에서 비밀번호 변경과 2단계 인증을 완료해야 합니다.
                </p>
            </div>
            <div>
                <label htmlFor="admin-name" className="text-sm font-semibold">
                    담당자 이름
                </label>
                <input
                    id="admin-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={50}
                    required
                    disabled={pending}
                    autoComplete="off"
                    className="border-input bg-background mt-2 w-full rounded-lg border px-3.5 py-2"
                />
            </div>
            <div>
                <label
                    htmlFor="admin-account-email"
                    className="text-sm font-semibold"
                >
                    업무용 이메일
                </label>
                <input
                    id="admin-account-email"
                    type="email"
                    value={email}
                    onChange={(event) =>
                        setEmail(event.target.value.toLowerCase())
                    }
                    maxLength={254}
                    required
                    disabled={pending}
                    autoComplete="off"
                    className="border-input bg-background mt-2 w-full rounded-lg border px-3.5 py-2"
                />
            </div>
            <div>
                <label htmlFor="admin-duty" className="text-sm font-semibold">
                    담당 업무
                </label>
                <select
                    id="admin-duty"
                    value={duty}
                    onChange={(event) =>
                        setDuty(event.target.value as (typeof DUTIES)[number])
                    }
                    disabled={pending}
                    className="border-input bg-background mt-2 w-full rounded-lg border px-3.5 py-2"
                >
                    {DUTIES.map((value) => (
                        <option key={value} value={value}>
                            {value}
                        </option>
                    ))}
                </select>
            </div>
            <div>
                <label
                    htmlFor="admin-issue-reason"
                    className="text-sm font-semibold"
                >
                    발급 사유 (5~500자)
                </label>
                <textarea
                    id="admin-issue-reason"
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
                {pending ? "발급 중…" : "관리자 계정 발급"}
            </button>
            {issued && (
                <div
                    role="status"
                    className="bg-muted/50 rounded-xl p-4 text-sm"
                >
                    <p>
                        로그인 이메일: <strong>{issued.email}</strong>
                    </p>
                    <p className="mt-1 break-all">
                        임시 비밀번호:{" "}
                        <strong>{issued.temporaryPassword}</strong>
                    </p>
                    <p className="text-description-foreground mt-2 text-xs">
                        안전한 별도 채널로 전달하고 이 화면을 닫아 주세요. 임시
                        비밀번호는 다시 조회할 수 없습니다.
                    </p>
                </div>
            )}
        </form>
    );
}

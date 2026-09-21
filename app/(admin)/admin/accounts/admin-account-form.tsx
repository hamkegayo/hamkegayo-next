"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

const ALL_DUTIES = ["계정", "심사", "정산"] as const;
type Duty = (typeof ALL_DUTIES)[number];

type IssuedAccount = {
    id: string;
    email: string;
    temporaryPassword: string;
};

export function AdminAccountForm({
    issuerDuty,
}: {
    issuerDuty: string | null;
}) {
    const duties: readonly Duty[] =
        issuerDuty === "전체" ? ALL_DUTIES : ["심사", "정산"];
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [duty, setDuty] = useState<Duty>(duties[0]);
    const [reason, setReason] = useState("");
    const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
    const [issued, setIssued] = useState<IssuedAccount | null>(null);
    const [reissueReason, setReissueReason] = useState("");
    const [pending, startTransition] = useTransition();

    const issue = (event: React.FormEvent) => {
        event.preventDefault();
        if (!deliveryConfirmed) {
            toast.error("임시 비밀번호 전달 원칙을 확인해 주세요.");
            return;
        }
        startTransition(async () => {
            const response = await fetch("/api/admin/accounts/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, duty, reason }),
            });
            const result = (await response.json()) as Partial<IssuedAccount> & {
                message?: string;
            };
            if (
                !response.ok ||
                !result.id ||
                !result.email ||
                !result.temporaryPassword
            ) {
                toast.error(
                    result.message ?? "관리자 계정 발급에 실패했습니다.",
                );
                return;
            }
            setIssued({
                id: result.id,
                email: result.email,
                temporaryPassword: result.temporaryPassword,
            });
            setName("");
            setEmail("");
            setReason("");
            setDeliveryConfirmed(false);
            toast.success("관리자 전용 계정을 발급했습니다.");
        });
    };

    const reissue = () => {
        if (!issued) return;
        startTransition(async () => {
            const response = await fetch(
                "/api/admin/accounts/admin/reissue-password",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        targetId: issued.id,
                        reason: reissueReason,
                    }),
                },
            );
            const result = (await response.json()) as {
                temporaryPassword?: string;
                message?: string;
            };
            if (!response.ok || !result.temporaryPassword) {
                toast.error(
                    result.message ?? "임시 비밀번호 재발급에 실패했습니다.",
                );
                return;
            }
            setIssued({
                ...issued,
                temporaryPassword: result.temporaryPassword,
            });
            setReissueReason("");
            toast.success("이전 비밀번호를 폐기하고 새로 발급했습니다.");
        });
    };

    return (
        <form
            className="border-border bg-background h-full space-y-4 rounded-2xl border p-6 md:p-8"
            onSubmit={issue}
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
                    onChange={(event) => setDuty(event.target.value as Duty)}
                    disabled={pending}
                    className="border-input bg-background mt-2 w-full rounded-lg border px-3.5 py-2"
                >
                    {duties.map((value) => (
                        <option key={value} value={value}>
                            {value}
                        </option>
                    ))}
                </select>
                <p className="text-description-foreground mt-1 text-xs">
                    전체 권한은 이 화면에서 발급할 수 없습니다.
                </p>
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
            <label className="flex items-start gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={deliveryConfirmed}
                    onChange={(event) =>
                        setDeliveryConfirmed(event.target.checked)
                    }
                    required
                    disabled={pending}
                    className="mt-1"
                />
                임시 비밀번호를 승인된 메신저 또는 대면으로 즉시 전달하고 별도
                문서·메일·업무 메모에 기록하지 않겠습니다.
            </label>
            <button
                disabled={pending}
                className="bg-brand text-brand-foreground rounded-lg px-5 py-2.5 font-bold disabled:opacity-50"
            >
                {pending ? "발급 중…" : "관리자 계정 발급"}
            </button>
            {issued && (
                <div
                    role="status"
                    className="bg-muted/50 space-y-3 rounded-xl p-4 text-sm"
                >
                    <div>
                        <p>
                            로그인 이메일: <strong>{issued.email}</strong>
                        </p>
                        <p className="mt-1 break-all">
                            임시 비밀번호:{" "}
                            <strong>{issued.temporaryPassword}</strong>
                        </p>
                        <p className="text-description-foreground mt-2 text-xs">
                            지금 전달해 주세요. 화면을 벗어나면 다시 조회할 수
                            없습니다.
                        </p>
                    </div>
                    <div className="border-border border-t pt-3">
                        <label
                            htmlFor="admin-reissue-reason"
                            className="font-semibold"
                        >
                            전달 실패·분실 시 재발급 사유
                        </label>
                        <textarea
                            id="admin-reissue-reason"
                            value={reissueReason}
                            onChange={(event) =>
                                setReissueReason(event.target.value)
                            }
                            minLength={5}
                            maxLength={500}
                            disabled={pending}
                            className="border-input bg-background mt-2 w-full rounded-lg border p-3"
                        />
                        <button
                            type="button"
                            onClick={reissue}
                            disabled={
                                pending || reissueReason.trim().length < 5
                            }
                            className="border-border bg-background mt-2 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                        >
                            기존 비밀번호 폐기 후 재발급
                        </button>
                    </div>
                </div>
            )}
        </form>
    );
}

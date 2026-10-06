"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    findCompensationTarget,
    grantCompensation,
    revokeCompensation,
    type CompensationTarget,
} from "./actions";
import { KIND_LABEL, MAX_COMPENSATION } from "./kinds";

const STATUS_LABEL: Record<string, string> = {
    MATCHING: "매칭 중",
    CONFIRMED: "확정",
    CANCELLED: "취소",
    COMPLETED: "완료",
};

const input = "mt-1 block w-full rounded border p-2";
const button =
    "cursor-pointer rounded border px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function CompensationGrantForm() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [code, setCode] = useState("");
    const [target, setTarget] = useState<CompensationTarget | null>(null);
    const [kind, setKind] = useState("");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [evidence, setEvidence] = useState("");
    const [allowDuplicate, setAllowDuplicate] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [message, setMessage] = useState("");

    const amountValue = Number(amount);
    const amountValid =
        Number.isInteger(amountValue) &&
        amountValue >= 1 &&
        amountValue <= MAX_COMPENSATION;
    const canGrant =
        !!target &&
        !!kind &&
        amountValid &&
        reason.trim().length >= 5 &&
        evidence.trim().length >= 2 &&
        confirmed &&
        (target.grantCount === 0 || allowDuplicate);

    function lookup() {
        setMessage("");
        startTransition(async () => {
            const result = await findCompensationTarget(code);
            if (!result.ok) {
                setTarget(null);
                setMessage(result.message);
                return;
            }
            setTarget(result.data);
            setAllowDuplicate(false);
            setConfirmed(false);
        });
    }

    function grant() {
        if (!target) return;
        setMessage("");
        startTransition(async () => {
            const result = await grantCompensation({
                reservationId: target.reservationId,
                kind,
                amount: amountValue,
                reason,
                evidenceRef: evidence,
                allowDuplicate,
            });
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            setMessage(
                `${target.code}에 ${amountValue.toLocaleString()}P를 지급했습니다. 고객에게 알림이 발송됐습니다.`,
            );
            setTarget(null);
            setCode("");
            setKind("");
            setAmount("");
            setReason("");
            setEvidence("");
            setConfirmed(false);
            router.refresh();
        });
    }

    return (
        <div className="mt-6 max-w-xl rounded-lg border p-5">
            <h2 className="text-lg font-bold">지급하기</h2>
            <div className="mt-3 flex gap-2">
                <label className="flex-1">
                    예약번호
                    <input
                        className={input}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") lookup();
                        }}
                        maxLength={40}
                    />
                </label>
                <button
                    type="button"
                    className={`${button} self-end`}
                    disabled={pending || !code.trim()}
                    onClick={lookup}
                >
                    조회
                </button>
            </div>

            {target && (
                <div className="mt-4 space-y-3">
                    <dl className="bg-muted/40 grid grid-cols-[6rem_1fr] gap-y-1 rounded p-3 text-sm">
                        <dt className="text-muted-foreground">예약</dt>
                        <dd>
                            {target.code} ·{" "}
                            {STATUS_LABEL[target.status] ?? target.status} ·{" "}
                            {target.useDate ?? "-"}
                        </dd>
                        <dt className="text-muted-foreground">고객</dt>
                        <dd>{target.customerName ?? "-"}</dd>
                        <dt className="text-muted-foreground">파트너</dt>
                        <dd>{target.partnerName ?? "-"}</dd>
                        <dt className="text-muted-foreground">종료</dt>
                        <dd>
                            {target.terminationKind ?? "서비스 기록 없음"}
                            {target.noShow ? " · 이용자 노쇼" : ""}
                        </dd>
                        <dt className="text-muted-foreground">기지급</dt>
                        <dd>
                            {target.grantCount}건 ·{" "}
                            {target.grantedTotal.toLocaleString()}P
                        </dd>
                    </dl>

                    <label className="block">
                        보상 사유
                        <select
                            className={input}
                            value={kind}
                            onChange={(e) => setKind(e.target.value)}
                        >
                            <option value="">선택</option>
                            {Object.entries(KIND_LABEL).map(
                                ([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ),
                            )}
                        </select>
                    </label>
                    <label className="block">
                        금액 (P, 1-{MAX_COMPENSATION.toLocaleString()})
                        <input
                            className={input}
                            inputMode="numeric"
                            value={amount}
                            onChange={(e) =>
                                setAmount(e.target.value.replace(/[^0-9]/g, ""))
                            }
                            maxLength={6}
                        />
                    </label>
                    <label className="block">
                        상세 사유 (5-500자)
                        <textarea
                            className={input}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={500}
                            rows={3}
                        />
                    </label>
                    <label className="block">
                        증빙 문서명 또는 관리번호
                        <input
                            className={input}
                            value={evidence}
                            onChange={(e) => setEvidence(e.target.value)}
                            maxLength={200}
                        />
                    </label>
                    {target.grantCount > 0 && (
                        <label className="flex gap-2 text-sm text-amber-700">
                            <input
                                type="checkbox"
                                checked={allowDuplicate}
                                onChange={(e) =>
                                    setAllowDuplicate(e.target.checked)
                                }
                            />
                            이 예약에 이미 지급한 보상이 있습니다. 추가 지급이
                            맞습니다.
                        </label>
                    )}
                    <label className="flex gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        귀책 사실과 증빙을 확인했고 고객에게 포인트를
                        지급합니다.
                    </label>
                    <button
                        type="button"
                        className={button}
                        disabled={pending || !canGrant}
                        onClick={grant}
                    >
                        지급
                    </button>
                </div>
            )}
            {message && (
                <p role="status" className="mt-3 text-sm break-keep">
                    {message}
                </p>
            )}
        </div>
    );
}

export function RevokeButton({ id }: { id: string }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [message, setMessage] = useState("");

    if (!open)
        return (
            <button
                type="button"
                className="text-muted-foreground mt-2 cursor-pointer text-sm underline"
                onClick={() => setOpen(true)}
            >
                잘못 지급 — 회수
            </button>
        );

    return (
        <div className="mt-3 space-y-2">
            <label className="block text-sm">
                회수 사유 (5-500자) · 고객이 이미 사용한 만큼은 회수하지
                않습니다.
                <input
                    className={input}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                />
            </label>
            <div className="flex gap-2">
                <button
                    type="button"
                    className={button}
                    disabled={pending || reason.trim().length < 5}
                    onClick={() =>
                        startTransition(async () => {
                            const result = await revokeCompensation({
                                id,
                                reason,
                            });
                            if (!result.ok) {
                                setMessage(result.message);
                                return;
                            }
                            setMessage(
                                `${result.data.toLocaleString()}P를 회수했습니다.`,
                            );
                            router.refresh();
                        })
                    }
                >
                    회수
                </button>
                <button
                    type="button"
                    className={button}
                    disabled={pending}
                    onClick={() => setOpen(false)}
                >
                    취소
                </button>
            </div>
            {message && (
                <p role="status" className="text-sm">
                    {message}
                </p>
            )}
        </div>
    );
}

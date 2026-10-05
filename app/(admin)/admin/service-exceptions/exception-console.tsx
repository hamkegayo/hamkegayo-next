"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { kstDateTime } from "@/lib/format";

type Detail = {
    serviceId: string;
    code: string;
    kind: string;
    startedAt: string | null;
    endedAt: string;
    cashPaid: number;
    eventUsed: boolean;
    decision: {
        decision: string;
        final_cash: number;
        partner_payout: number;
        evidence_reference: string;
        restore_benefit: boolean;
        resolved_at: string | null;
    } | null;
    transactions: {
        paymentId: string;
        orderId: string;
        transactionId: string | null;
        cash: number;
        targetBalance: number;
        refund: number;
        additional: boolean;
        status: string;
    }[];
};
const inputClass = "w-full rounded border p-2";
const buttonClass =
    "cursor-pointer rounded border px-4 py-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
export function ExceptionConsole({ serviceId }: { serviceId: string }) {
    const router = useRouter();
    const [detail, setDetail] = useState<Detail | null>(null);
    const [reason, setReason] = useState("");
    const [evidence, setEvidence] = useState("");
    const [decision, setDecision] = useState("PARTIAL");
    const [finalCash, setFinalCash] = useState("");
    const [payout, setPayout] = useState("");
    const [restore, setRestore] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    async function load() {
        const { data, error } = await createClient().rpc(
            "admin_get_service_exception",
            {
                p_service: serviceId,
                p_reason: reason.trim(),
            },
        );
        if (error || !data)
            throw new Error(
                "권한·MFA 및 5자 이상의 열람 사유를 확인해 주세요.",
            );
        setDetail(data);
        if (!data.decision) {
            setDecision(data.kind === "EMERGENCY" ? "EMERGENCY" : "PARTIAL");
            setFinalCash(String(data.cashPaid));
        }
    }
    async function run(action: () => Promise<void>) {
        setBusy(true);
        setMessage("");
        try {
            await action();
        } catch (error) {
            setMessage(
                error instanceof Error ? error.message : "요청에 실패했습니다.",
            );
        } finally {
            setBusy(false);
        }
    }
    async function plan() {
        if (
            !confirmed ||
            !/^(0|[1-9]\d*)$/.test(finalCash) ||
            !/^(0|[1-9]\d*)$/.test(payout)
        )
            throw new Error("원 단위 금액과 판정 확인이 필요합니다.");
        const result = await createClient().rpc(
            "admin_plan_service_exception",
            {
                p_service: serviceId,
                p_decision: decision,
                p_final_cash: Number(finalCash),
                p_partner_payout: Number(payout),
                p_reason: reason.trim(),
                p_evidence: evidence.trim(),
                p_restore: decision === "UNAVAILABLE" && restore,
            },
        );
        if (result.error)
            throw new Error(
                "판정을 기록하지 못했습니다. 기존 환불·미결제·정산 처리나 권한을 확인해 주세요.",
            );
        await load();
        setConfirmed(false);
        setMessage(
            "판정을 기록했습니다. 아래 주문별 PG 처리를 확인한 뒤 결과 조회를 진행해 주세요.",
        );
    }
    async function verify() {
        if (!confirmed)
            throw new Error("PG 처리와 추가결제 확인이 필요합니다.");
        const response = await fetch("/api/admin/service-exceptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceId, reason, confirm: true }),
        });
        const result = await response.json();
        setMessage(result.message);
        if (result.ok) {
            await load();
            router.refresh();
        }
    }
    return (
        <div className="mt-3 space-y-3">
            <label className="block text-sm">
                판정·열람 사유 (5~500자, 의료 상세 내용 입력 금지)
                <textarea
                    className={inputClass}
                    minLength={5}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </label>
            <button
                className={buttonClass}
                disabled={busy}
                onClick={() => run(load)}
            >
                운영 상세 조회
            </button>
            {detail && (
                <div className="space-y-3 rounded border p-4">
                    <p>
                        시작:{" "}
                        {detail.startedAt
                            ? kstDateTime(detail.startedAt)
                            : "기록 없음"}{" "}
                        · 종료: {kstDateTime(detail.endedAt)}
                    </p>
                    <p>
                        현재 현금 원장 합계: {detail.cashPaid.toLocaleString()}
                        원
                    </p>
                    {!detail.decision ? (
                        <>
                            <p className="text-sm">
                                담당자 김서현이 실제 제공 시간·귀책·증빙을
                                확인하여 판정합니다. 최소 1시간 요금은 예외 건에
                                자동 적용하지 않습니다. 최종 현금 청구액은
                                할인·포인트를 제외하고 고객에게 실제로 받을
                                금액입니다.
                            </p>
                            <label className="block">
                                판정
                                <select
                                    className={inputClass}
                                    value={decision}
                                    onChange={(e) => {
                                        setDecision(e.target.value);
                                        setRestore(
                                            e.target.value === "UNAVAILABLE" &&
                                                detail.eventUsed,
                                        );
                                        if (e.target.value === "UNAVAILABLE")
                                            setFinalCash("0");
                                    }}
                                >
                                    {detail.kind === "EMERGENCY" ? (
                                        <option value="EMERGENCY">
                                            응급 중단
                                        </option>
                                    ) : (
                                        <>
                                            <option value="PARTIAL">
                                                회사·파트너 사유 부분 제공
                                            </option>
                                            <option value="UNAVAILABLE">
                                                제공 불가 · 전액 현금 환불
                                            </option>
                                        </>
                                    )}
                                </select>
                            </label>
                            <label className="block">
                                최종 현금 청구액 (원)
                                <input
                                    className={inputClass}
                                    type="number"
                                    min={0}
                                    step={1}
                                    max={10000000}
                                    value={finalCash}
                                    disabled={decision === "UNAVAILABLE"}
                                    onChange={(e) =>
                                        setFinalCash(e.target.value)
                                    }
                                />
                            </label>
                            <label className="block">
                                최종 파트너 지급액 (원)
                                <input
                                    className={inputClass}
                                    type="number"
                                    min={0}
                                    step={1}
                                    max={10000000}
                                    value={payout}
                                    onChange={(e) => setPayout(e.target.value)}
                                />
                            </label>
                            <label className="block">
                                비공개 증빙 문서명·관리번호 (5~500자)
                                <input
                                    className={inputClass}
                                    maxLength={500}
                                    value={evidence}
                                    onChange={(e) =>
                                        setEvidence(e.target.value)
                                    }
                                />
                            </label>
                            {decision === "UNAVAILABLE" && detail.eventUsed && (
                                <label className="block">
                                    <input
                                        type="checkbox"
                                        checked={restore}
                                        onChange={(e) =>
                                            setRestore(e.target.checked)
                                        }
                                    />{" "}
                                    제공 불가 증빙 확인 · 사용한 이벤트 혜택
                                    복원 (행사 종료 후에는 복원 불가)
                                </label>
                            )}
                            <p>
                                현금 환불 예정:{" "}
                                {Math.max(
                                    detail.cashPaid - Number(finalCash),
                                    0,
                                ).toLocaleString()}
                                원 · 추가결제 예정:{" "}
                                {Math.max(
                                    Number(finalCash) - detail.cashPaid,
                                    0,
                                ).toLocaleString()}
                                원
                            </p>
                            <label className="block">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(e) =>
                                        setConfirmed(e.target.checked)
                                    }
                                />{" "}
                                금액·증빙을 확인했습니다. 기록 후 직접 수정할 수
                                없음을 확인합니다.
                            </label>
                            <button
                                className={buttonClass}
                                disabled={busy || !confirmed}
                                onClick={() => run(plan)}
                            >
                                운영 판정 기록
                            </button>
                        </>
                    ) : (
                        <>
                            <p>
                                최종 현금 청구액:{" "}
                                {detail.decision.final_cash.toLocaleString()}원
                                · 파트너 지급액:{" "}
                                {detail.decision.partner_payout.toLocaleString()}
                                원
                            </p>
                            <p>
                                증빙: {detail.decision.evidence_reference} ·
                                혜택 복원:{" "}
                                {detail.decision.restore_benefit
                                    ? "포함"
                                    : "없음"}
                            </p>
                            <ul className="space-y-2">
                                {detail.transactions.map((t) => (
                                    <li
                                        className="rounded border p-3 break-all"
                                        key={t.paymentId}
                                    >
                                        주문: {t.orderId} · 거래:{" "}
                                        {t.transactionId ?? "승인 대기"}
                                        <br />
                                        {t.additional
                                            ? `추가결제 ${t.cash.toLocaleString()}원 · ${t.status} (고객 인앱 알림에 결제 링크 발급)`
                                            : `PG 콘솔 환불 ${t.refund.toLocaleString()}원 · 확인할 잔액 ${t.targetBalance.toLocaleString()}원`}
                                    </li>
                                ))}
                            </ul>
                            {detail.decision.resolved_at ? (
                                <p role="status">
                                    운영 확인 완료 · 정산 지급은 별도 승인
                                    절차를 따릅니다.
                                </p>
                            ) : (
                                <>
                                    <p className="text-sm">
                                        이 버튼은 PG 거래를 조회합니다. PG
                                        관리자에서 위 주문별 환불을 처리하고,
                                        추가결제가 있으면 고객 결제 완료 후
                                        진행하세요. 환불 결과가 불명확하면
                                        재환불하지 마세요.
                                    </p>
                                    <label className="block">
                                        <input
                                            type="checkbox"
                                            checked={confirmed}
                                            onChange={(e) =>
                                                setConfirmed(e.target.checked)
                                            }
                                        />{" "}
                                        주문별 PG 처리와 고객 추가결제를
                                        확인했습니다.
                                    </label>
                                    <button
                                        className={buttonClass}
                                        disabled={busy || !confirmed}
                                        onClick={() => run(verify)}
                                    >
                                        PG 결과 조회 · 원장 기록 · 보류 해제
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
            {message && (
                <p role="status" className="text-sm">
                    {message}
                </p>
            )}
        </div>
    );
}

export function UnavailableServiceForm() {
    const router = useRouter();
    const [code, setCode] = useState("");
    const [reason, setReason] = useState("");
    const [evidence, setEvidence] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    async function submit() {
        setBusy(true);
        try {
            const { error } = await createClient().rpc(
                "admin_mark_service_unavailable",
                {
                    p_code: code.trim(),
                    p_reason: reason.trim(),
                    p_evidence: evidence.trim(),
                },
            );
            setMessage(
                error
                    ? "시작 전 확정 예약·권한·MFA·증빙을 확인해 주세요."
                    : "운영 확인 목록에 등록했습니다. 아래에서 전액 현금 환불 판정을 기록해 주세요.",
            );
            if (!error) {
                setConfirmed(false);
                router.refresh();
            }
        } finally {
            setBusy(false);
        }
    }
    return (
        <details className="mt-5 rounded border p-4">
            <summary className="cursor-pointer font-bold">
                시작 전 회사·파트너 사유 제공 불가 등록
            </summary>
            <div className="mt-3 space-y-3">
                <p className="text-sm">
                    시작 전 확정 예약을 운영 확인 대상으로 등록합니다. 이
                    단계에서는 환불·혜택 복원을 실행하지 않습니다.
                </p>
                <label className="block">
                    예약번호
                    <input
                        className={inputClass}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                    />
                </label>
                <label className="block">
                    사유 (5~500자)
                    <textarea
                        className={inputClass}
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </label>
                <label className="block">
                    비공개 증빙 문서명·관리번호 (5~500자)
                    <input
                        className={inputClass}
                        maxLength={500}
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                    />
                </label>
                <label className="block">
                    <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                    />{" "}
                    실제 서비스 미제공 및 회사·파트너 사유 증빙을 확인했습니다.
                </label>
                <button
                    className={buttonClass}
                    disabled={busy || !confirmed}
                    onClick={submit}
                >
                    운영 확인 대상으로 등록
                </button>
                {message && <p role="status">{message}</p>}
            </div>
        </details>
    );
}

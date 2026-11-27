"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
    ACCEPT_CHANNELS,
    ACCEPT_CHANNEL_LABEL,
    FAILURE_NOTICE_METHODS,
    FAILURE_NOTICE_METHOD_LABEL,
    type DirectActionResult,
} from "@/lib/direct-admin";
import {
    acknowledgeIntakeAction,
    assignPartnerAction,
    failMatchingAction,
    markRefundPgCancelledAction,
    recordFailureNoticeAction,
    resendIntakeEmailAction,
    retryRefundAction,
} from "../_actions/direct";

const inputCls =
    "border-border bg-background w-full rounded-lg border p-2 text-sm";
const btnCls =
    "bg-brand cursor-pointer rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const subBtnCls =
    "border-border cursor-pointer rounded-lg border px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50";

const DirectActionFeedbackContext = createContext<{
    bannerResult: DirectActionResult | null;
    setBannerResult: (result: DirectActionResult | null) => void;
} | null>(null);

export function DirectActionFeedbackProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [bannerResult, setBannerResult] = useState<DirectActionResult | null>(
        null,
    );
    return (
        <DirectActionFeedbackContext.Provider
            value={{ bannerResult, setBannerResult }}
        >
            {children}
        </DirectActionFeedbackContext.Provider>
    );
}

export function DirectActionResultBanner() {
    const feedback = useContext(DirectActionFeedbackContext);
    const result = feedback?.bannerResult;
    if (!result?.ok || !result.message) return null;
    return (
        <p
            role="status"
            className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
        >
            {result.message}
        </p>
    );
}

function useRun() {
    const router = useRouter();
    const feedback = useContext(DirectActionFeedbackContext);
    const [pending, start] = useTransition();
    const [result, setResult] = useState<DirectActionResult | null>(null);
    function run(fn: () => Promise<DirectActionResult>) {
        start(async () => {
            setResult(null);
            feedback?.setBannerResult(null);
            try {
                const res = await fn();
                if (res.ok && feedback) {
                    feedback.setBannerResult(res);
                } else {
                    setResult(res);
                }
            } catch {
                setResult({
                    ok: false,
                    message:
                        "결과를 확인하지 못했습니다. 새로고침해 현재 상태를 확인해 주세요.",
                });
            }
            router.refresh();
        });
    }
    return { pending, result, run };
}

function Result({ result }: { result: DirectActionResult | null }) {
    if (!result?.message) return null;
    return (
        <p
            role={result.ok ? "status" : "alert"}
            className={`mt-2 text-sm font-semibold ${result.ok ? "text-emerald-700" : "text-red-600"}`}
        >
            {result.message}
        </p>
    );
}

export function IntakeControls({
    reservationId,
    acknowledged,
    canResend,
}: {
    reservationId: string;
    acknowledged: boolean;
    canResend: boolean;
}) {
    const { pending, result, run } = useRun();
    return (
        <div>
            <div className="flex flex-wrap gap-2">
                {!acknowledged && (
                    <button
                        className={subBtnCls}
                        disabled={pending}
                        onClick={() =>
                            run(() =>
                                acknowledgeIntakeAction({ reservationId }),
                            )
                        }
                    >
                        접수 확인
                    </button>
                )}
                {canResend && (
                    <button
                        className={subBtnCls}
                        disabled={pending}
                        onClick={() =>
                            run(() =>
                                resendIntakeEmailAction({ reservationId }),
                            )
                        }
                    >
                        접수 알림 메일 재발송
                    </button>
                )}
            </div>
            <Result result={result} />
        </div>
    );
}

export function AssignForm({
    reservationId,
    mode,
    partners,
    currentPartnerId,
}: {
    reservationId: string;
    mode: "ASSIGN" | "REASSIGN";
    partners: { partner_id: string; name: string; conflict: boolean }[];
    currentPartnerId: string | null;
}) {
    const { pending, result, run } = useRun();
    const [partnerId, setPartnerId] = useState("");
    const [channel, setChannel] = useState("PHONE");
    const [confirmed, setConfirmed] = useState(false);
    const [memo, setMemo] = useState("");
    const options = partners.filter((p) => p.partner_id !== currentPartnerId);
    const selected = options.find((p) => p.partner_id === partnerId);
    const label = mode === "ASSIGN" ? "배정하고 예약 확정" : "담당 파트너 변경";

    return (
        <div className="space-y-3">
            <label className="block text-sm font-semibold">
                파트너
                <select
                    className={`${inputCls} mt-1`}
                    value={partnerId}
                    onChange={(e) => setPartnerId(e.target.value)}
                >
                    <option value="">선택해 주세요</option>
                    {options.map((p) => (
                        <option key={p.partner_id} value={p.partner_id}>
                            {p.name}
                            {p.conflict ? " (같은 시간 다른 일정 있음)" : ""}
                        </option>
                    ))}
                </select>
            </label>
            {selected?.conflict && (
                <p className="text-sm font-semibold text-amber-700">
                    이 파트너는 같은 시간대에 확정된 다른 일정이 있어 배정이
                    거절될 수 있습니다.
                </p>
            )}
            <label className="block text-sm font-semibold">
                수락 확인 방법
                <select
                    className={`${inputCls} mt-1`}
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                >
                    {ACCEPT_CHANNELS.map((c) => (
                        <option key={c} value={c}>
                            {ACCEPT_CHANNEL_LABEL[c]}
                        </option>
                    ))}
                </select>
            </label>
            <label className="block text-sm font-semibold">
                메모 (선택, 500자)
                <textarea
                    className={`${inputCls} mt-1`}
                    rows={2}
                    maxLength={500}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                />
            </label>
            <label className="flex items-start gap-2 text-sm">
                <input
                    type="checkbox"
                    className="mt-1"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                />
                파트너에게 외부 연락(전화·문자 등)으로 수락 의사를 직접
                확인했습니다.
            </label>
            <button
                className={btnCls}
                disabled={pending || !partnerId || !confirmed}
                onClick={() =>
                    run(() =>
                        assignPartnerAction({
                            reservationId,
                            partnerId,
                            channel,
                            acceptanceConfirmed: confirmed,
                            memo,
                            expectedAction: mode,
                        }),
                    )
                }
            >
                {label}
            </button>
            <Result result={result} />
        </div>
    );
}

export function FailMatchingForm({ reservationId }: { reservationId: string }) {
    const { pending, result, run } = useRun();
    const [reason, setReason] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    return (
        <div className="space-y-3">
            <label className="block text-sm font-semibold">
                실패 사유 (내부 기록)
                <input
                    className={`${inputCls} mt-1`}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </label>
            <label className="flex items-start gap-2 text-sm">
                <input
                    type="checkbox"
                    className="mt-1"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                />
                매칭 실패로 처리하고 결제 금액을 PG 에서 전액 환불합니다. 되돌릴
                수 없습니다.
            </label>
            <button
                className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending || !confirmed || reason.trim().length < 2}
                onClick={() =>
                    run(() =>
                        failMatchingAction({
                            reservationId,
                            reason,
                            confirmed,
                        }),
                    )
                }
            >
                매칭 실패 처리 및 전액 환불
            </button>
            <Result result={result} />
        </div>
    );
}

export function RefundControls({
    reservationId,
    canMarkPg,
}: {
    reservationId: string;
    canMarkPg: boolean;
}) {
    const { pending, result, run } = useRun();
    const [memo, setMemo] = useState("");
    return (
        <div className="space-y-3">
            <button
                className={btnCls}
                disabled={pending}
                onClick={() => run(() => retryRefundAction({ reservationId }))}
            >
                환불 재시도
            </button>
            {canMarkPg && (
                <div className="border-border rounded-lg border border-dashed p-3">
                    <p className="text-xs">
                        PG 응답이 유실돼 취소 여부를 알 수 없을 때만 사용합니다.
                        PG 콘솔에서 이미 취소된 것을 확인한 뒤 근거를 적어
                        주세요. 이후 재시도는 PG 를 다시 호출하지 않습니다.
                    </p>
                    <input
                        className={`${inputCls} mt-2`}
                        placeholder="확인 근거 (5자 이상)"
                        maxLength={500}
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                    />
                    <button
                        className={`${subBtnCls} mt-2`}
                        disabled={pending || memo.trim().length < 5}
                        onClick={() =>
                            run(() =>
                                markRefundPgCancelledAction({
                                    reservationId,
                                    memo,
                                }),
                            )
                        }
                    >
                        PG 취소 확인 기록
                    </button>
                </div>
            )}
            <Result result={result} />
        </div>
    );
}

export function FailureNoticeForm({
    reservationId,
}: {
    reservationId: string;
}) {
    const { pending, result, run } = useRun();
    const [method, setMethod] = useState("PHONE");
    const [confirmed, setConfirmed] = useState(false);
    const [memo, setMemo] = useState("");
    return (
        <div className="space-y-3">
            <label className="block text-sm font-semibold">
                안내 방법
                <select
                    className={`${inputCls} mt-1`}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                >
                    {FAILURE_NOTICE_METHODS.map((m) => (
                        <option key={m} value={m}>
                            {FAILURE_NOTICE_METHOD_LABEL[m]}
                        </option>
                    ))}
                </select>
            </label>
            <label className="block text-sm font-semibold">
                메모 (선택)
                <textarea
                    className={`${inputCls} mt-1`}
                    rows={2}
                    maxLength={500}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                />
            </label>
            <label className="flex items-start gap-2 text-sm">
                <input
                    type="checkbox"
                    className="mt-1"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                />
                고객에게 매칭 실패와 환불 안내를 직접 마쳤습니다.
            </label>
            <button
                className={btnCls}
                disabled={pending || !confirmed}
                onClick={() =>
                    run(() =>
                        recordFailureNoticeAction({
                            reservationId,
                            method,
                            confirmed,
                            memo,
                        }),
                    )
                }
            >
                실패 안내 완료 기록
            </button>
            <Result result={result} />
        </div>
    );
}

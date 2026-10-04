"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { kstDateTime } from "@/lib/format";
import {
    recordPaymentIncidentContact,
    updatePaymentIncidentStatus,
} from "./_actions/incidents";
import type {
    PaymentIncidentHistory,
    PaymentIncidentView,
} from "./_lib/payment-incidents.server";

const KIND_LABEL: Record<string, string> = {
    CANCEL_FAILED: "승인 취소 실패",
    APPROVE_INDETERMINATE: "승인 결과 불명",
    POINT_RESTORE_FAILED: "포인트 복원 실패",
    STATE_MISMATCH: "PG·DB 상태 불일치",
    AMOUNT_MISMATCH: "결제 금액 불일치",
    UNKNOWN_ORDER: "알 수 없는 주문",
    FINALIZE_FAILED: "예약 확정 실패",
    REFUND_FAILED: "환불 실패",
    REFUND_RECORD_FAILED: "환불 기록 실패",
};

const STATUS_LABEL = {
    OPEN: "미처리",
    ACKNOWLEDGED: "확인 중",
    RESOLVED: "해결",
} as const;

const SEVERITY_LABEL = {
    CRITICAL: "최상",
    HIGH: "높음",
    MEDIUM: "보통",
} as const;

const CONTACT_LABEL: Record<string, string> = {
    PHONE: "전화",
    EMAIL: "이메일",
    KAKAO: "카카오톡",
    OTHER: "기타",
};

type DialogState =
    | {
          type: "status";
          incident: PaymentIncidentView;
          nextStatus: "ACKNOWLEDGED" | "RESOLVED";
      }
    | { type: "contact"; incident: PaymentIncidentView }
    | null;

function formatAt(value: string): string {
    return kstDateTime(value) ?? value;
}

function HistoryItem({ item }: { item: PaymentIncidentHistory }) {
    return (
        <li className="border-border border-l-2 py-1 pl-3">
            <p className="text-foreground text-sm font-semibold">
                {item.action === "CUSTOMER_CONTACT"
                    ? `고객 안내 · ${CONTACT_LABEL[item.contactMethod ?? ""] ?? item.contactMethod}`
                    : `${item.fromStatus ? STATUS_LABEL[item.fromStatus as keyof typeof STATUS_LABEL] : "-"} → ${item.toStatus ? STATUS_LABEL[item.toStatus as keyof typeof STATUS_LABEL] : "-"}`}
            </p>
            <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-wrap">
                {item.note}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
                {formatAt(item.createdAt)}
            </p>
        </li>
    );
}

export function PaymentIncidentsView({
    incidents,
    loadError,
}: {
    incidents: PaymentIncidentView[];
    loadError: boolean;
}) {
    const router = useRouter();
    const [filter, setFilter] = useState<"ALL" | PaymentIncidentView["status"]>(
        "ALL",
    );
    const [dialog, setDialog] = useState<DialogState>(null);
    const [memo, setMemo] = useState("");
    const [method, setMethod] = useState<"PHONE" | "EMAIL" | "KAKAO" | "OTHER">(
        "PHONE",
    );
    const [pending, startTransition] = useTransition();

    const visible = useMemo(
        () =>
            filter === "ALL"
                ? incidents
                : incidents.filter((incident) => incident.status === filter),
        [filter, incidents],
    );

    const counts = useMemo(
        () => ({
            open: incidents.filter((incident) => incident.status === "OPEN")
                .length,
            acknowledged: incidents.filter(
                (incident) => incident.status === "ACKNOWLEDGED",
            ).length,
            critical: incidents.filter(
                (incident) =>
                    incident.status !== "RESOLVED" &&
                    incident.severity === "CRITICAL",
            ).length,
        }),
        [incidents],
    );

    const openDialog = (next: Exclude<DialogState, null>) => {
        setMemo("");
        setMethod("PHONE");
        setDialog(next);
    };

    const closeDialog = () => {
        if (pending) return;
        setDialog(null);
        setMemo("");
    };

    const submit = () => {
        if (!dialog || pending) return;
        startTransition(async () => {
            const result =
                dialog.type === "status"
                    ? await updatePaymentIncidentStatus({
                          incidentId: dialog.incident.id,
                          status: dialog.nextStatus,
                          memo,
                      })
                    : await recordPaymentIncidentContact({
                          incidentId: dialog.incident.id,
                          method,
                          note: memo,
                      });

            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            toast.success(
                dialog.type === "contact"
                    ? "고객 안내 이력을 저장했습니다."
                    : dialog.nextStatus === "ACKNOWLEDGED"
                      ? "사고를 확인 중으로 변경했습니다."
                      : "사고를 해결 완료로 변경했습니다.",
            );
            setDialog(null);
            setMemo("");
            router.refresh();
        });
    };

    if (loadError) {
        return (
            <div
                role="alert"
                className="border-destructive/40 bg-destructive/10 text-foreground mt-6 rounded-2xl border px-5 py-4 text-sm"
            >
                결제 사고 정보를 불러오지 못했습니다. 사고가 없다는 의미가
                아니므로 새로고침 후 다시 확인해 주세요.
            </div>
        );
    }

    return (
        <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <SummaryCard
                    label="미처리"
                    value={counts.open}
                    icon={AlertTriangle}
                />
                <SummaryCard
                    label="확인 중"
                    value={counts.acknowledged}
                    icon={Clock3}
                />
                <SummaryCard
                    label="최상 심각도"
                    value={counts.critical}
                    icon={AlertTriangle}
                    danger={counts.critical > 0}
                />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
                {(["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED"] as const).map(
                    (status) => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setFilter(status)}
                            className={cn(
                                "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                                filter === status
                                    ? "bg-brand text-brand-foreground"
                                    : "bg-muted text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {status === "ALL" ? "전체" : STATUS_LABEL[status]}
                        </button>
                    ),
                )}
            </div>

            {visible.length === 0 ? (
                <div className="border-border text-muted-foreground mt-5 rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
                    해당 상태의 결제 사고가 없습니다.
                </div>
            ) : (
                <div className="mt-5 space-y-4">
                    {visible.map((incident) => (
                        <article
                            key={incident.id}
                            className="border-border bg-background rounded-2xl border p-5 md:p-6"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <SeverityBadge
                                            severity={incident.severity}
                                        />
                                        <StatusBadge status={incident.status} />
                                    </div>
                                    <h2 className="text-foreground mt-3 text-lg font-extrabold">
                                        {KIND_LABEL[incident.kind] ??
                                            incident.kind}
                                    </h2>
                                    <p className="text-muted-foreground mt-1 text-sm">
                                        주문번호 {incident.orderId ?? "-"} ·
                                        발생 {formatAt(incident.createdAt)}
                                    </p>
                                </div>
                                {incident.amount != null && (
                                    <p className="text-foreground text-xl font-extrabold">
                                        {incident.amount.toLocaleString()}원
                                    </p>
                                )}
                            </div>

                            <details className="border-border mt-4 rounded-xl border p-4">
                                <summary className="text-foreground cursor-pointer text-sm font-bold">
                                    사고 상세 및 처리 이력
                                </summary>
                                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                                    <div>
                                        <p className="text-muted-foreground text-xs font-bold">
                                            PG 응답 원문
                                        </p>
                                        <pre className="bg-muted mt-2 max-h-64 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
                                            {JSON.stringify(
                                                incident.detail ?? {},
                                                null,
                                                2,
                                            )}
                                        </pre>
                                        {incident.reservationId && (
                                            <Link
                                                href={`/admin/reservations/${incident.reservationId}?incident=${incident.id}`}
                                                className="text-brand mt-3 inline-flex text-sm font-bold hover:underline"
                                            >
                                                관련 예약 열람 →
                                            </Link>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs font-bold">
                                            처리 이력
                                        </p>
                                        {incident.history.length === 0 ? (
                                            <p className="text-muted-foreground mt-2 text-sm">
                                                기록이 없습니다.
                                            </p>
                                        ) : (
                                            <ul className="mt-2 space-y-3">
                                                {incident.history.map(
                                                    (item) => (
                                                        <HistoryItem
                                                            key={item.id}
                                                            item={item}
                                                        />
                                                    ),
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            </details>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        openDialog({
                                            type: "contact",
                                            incident,
                                        })
                                    }
                                    className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold"
                                >
                                    <MessageSquare className="size-4" />
                                    고객 안내 기록
                                </button>
                                {incident.status === "OPEN" && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            openDialog({
                                                type: "status",
                                                incident,
                                                nextStatus: "ACKNOWLEDGED",
                                            })
                                        }
                                        className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-bold"
                                    >
                                        확인 시작
                                    </button>
                                )}
                                {incident.status === "ACKNOWLEDGED" && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            openDialog({
                                                type: "status",
                                                incident,
                                                nextStatus: "RESOLVED",
                                            })
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
                                    >
                                        <CheckCircle2 className="size-4" />
                                        해결 완료
                                    </button>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}

            <Modal open={!!dialog} onClose={closeDialog} className="max-w-md">
                {dialog && (
                    <div>
                        <h3 className="text-foreground text-lg font-extrabold">
                            {dialog.type === "contact"
                                ? "고객 안내 기록"
                                : dialog.nextStatus === "ACKNOWLEDGED"
                                  ? "사고 확인 시작"
                                  : "해결 완료 표시"}
                        </h3>
                        <p className="text-muted-foreground mt-1 text-sm">
                            {KIND_LABEL[dialog.incident.kind] ??
                                dialog.incident.kind}{" "}
                            · {dialog.incident.orderId ?? "주문번호 없음"}
                        </p>

                        {dialog.type === "contact" && (
                            <label className="text-foreground mt-5 block text-sm font-bold">
                                안내 방법
                                <select
                                    value={method}
                                    onChange={(event) =>
                                        setMethod(
                                            event.target.value as typeof method,
                                        )
                                    }
                                    className="border-input bg-background mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm"
                                >
                                    <option value="PHONE">전화</option>
                                    <option value="EMAIL">이메일</option>
                                    <option value="KAKAO">카카오톡</option>
                                    <option value="OTHER">기타</option>
                                </select>
                            </label>
                        )}

                        <label className="text-foreground mt-4 block text-sm font-bold">
                            {dialog.type === "contact"
                                ? "안내 내용"
                                : "처리 메모"}
                        </label>
                        <textarea
                            value={memo}
                            onChange={(event) => setMemo(event.target.value)}
                            maxLength={1000}
                            placeholder={
                                dialog.type === "contact"
                                    ? "언제, 무엇을 안내했는지 기록해 주세요."
                                    : "확인한 내용과 조치 결과를 기록해 주세요."
                            }
                            className="border-input bg-background mt-2 min-h-28 w-full rounded-lg border px-3.5 py-2.5 text-sm"
                        />
                        {dialog.type === "status" &&
                            dialog.nextStatus === "RESOLVED" && (
                                <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                    이 버튼은 PG 취소를 실행하지 않습니다.
                                    필요한 외부 조치를 완료한 뒤 결과를
                                    메모하세요.
                                </p>
                            )}

                        <div className="mt-6 flex gap-3">
                            <button
                                type="button"
                                onClick={closeDialog}
                                disabled={pending}
                                className="border-border flex-1 rounded-lg border px-4 py-3 text-sm font-bold disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={submit}
                                disabled={pending || memo.trim().length < 2}
                                className="bg-brand text-brand-foreground flex-1 rounded-lg px-4 py-3 text-sm font-bold disabled:opacity-50"
                            >
                                {pending ? "저장 중…" : "기록 저장"}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}

function SummaryCard({
    label,
    value,
    icon: Icon,
    danger = false,
}: {
    label: string;
    value: number;
    icon: typeof AlertTriangle;
    danger?: boolean;
}) {
    return (
        <div
            className={cn(
                "border-border bg-background rounded-2xl border p-5",
                danger &&
                    "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20",
            )}
        >
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Icon className="size-4" />
                {label}
            </p>
            <p
                className={cn(
                    "mt-2 text-3xl font-extrabold",
                    danger ? "text-red-600" : "text-foreground",
                )}
            >
                {value.toLocaleString()}
            </p>
        </div>
    );
}

function SeverityBadge({
    severity,
}: {
    severity: PaymentIncidentView["severity"];
}) {
    return (
        <span
            className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold",
                severity === "CRITICAL" &&
                    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                severity === "HIGH" &&
                    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                severity === "MEDIUM" &&
                    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
            )}
        >
            {SEVERITY_LABEL[severity]}
        </span>
    );
}

function StatusBadge({ status }: { status: PaymentIncidentView["status"] }) {
    return (
        <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-bold">
            {STATUS_LABEL[status]}
        </span>
    );
}

import type { Metadata } from "next";
import Link from "next/link";

import { formatElapsed, intakeNotifyLabel } from "@/lib/direct-admin";
import { formatUseDate, kstDateTime } from "@/lib/format";
import {
    getRefundIssues,
    getWaitingReservations,
} from "./_lib/direct-reservations.server";

export const metadata: Metadata = {
    title: "예약 배정",
    robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-800",
    bad: "bg-red-100 text-red-700",
    neutral: "bg-muted text-muted-foreground",
};

const REFUND_LABEL: Record<string, string> = {
    REQUESTED: "환불 요청됨",
    PROCESSING: "PG 취소 처리 중",
    PG_FAILED: "PG 취소 실패",
    REFUNDED: "환불 완료",
};

export default async function AdminReservationsPage() {
    const [waiting, issues] = await Promise.all([
        getWaitingReservations(),
        getRefundIssues(),
    ]);
    const overdueCount = waiting.rows.filter((r) => r.overdue).length;

    return (
        <div>
            <Link
                href="/admin"
                className="text-brand text-sm font-bold hover:underline"
            >
                ← 관리자 홈
            </Link>
            <h1 className="text-foreground mt-4 text-2xl font-extrabold">
                예약 배정
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
                결제가 끝났지만 아직 파트너가 배정되지 않은 예약입니다. 오래된
                순서로 보여 드립니다.
            </p>

            {overdueCount > 0 && (
                <p
                    role="alert"
                    className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
                >
                    결제 후 24시간이 지난 미배정 예약이 {overdueCount}건
                    있습니다. 자동으로 실패·환불 처리되지 않으니 직접 처리해
                    주세요.
                </p>
            )}

            <section className="mt-6">
                <h2 className="text-foreground text-lg font-bold">
                    배정 대기{" "}
                    {waiting.loadError ? "" : `(${waiting.rows.length})`}
                </h2>
                {waiting.loadError ? (
                    <p
                        role="alert"
                        className="mt-3 text-sm font-bold text-red-600"
                    >
                        목록을 불러오지 못했습니다. 관리자 권한·2단계 인증을
                        확인해 주세요. 조회 실패는 대기 건이 없다는 뜻이
                        아닙니다.
                    </p>
                ) : waiting.rows.length === 0 ? (
                    <p className="text-muted-foreground mt-3 rounded-xl border border-dashed px-6 py-10 text-center text-sm">
                        배정 대기 중인 예약이 없습니다.
                    </p>
                ) : (
                    <ul className="mt-3 space-y-3">
                        {waiting.rows.map((r) => {
                            const notify = intakeNotifyLabel(
                                r.notify_status,
                                r.notify_attempts ?? 0,
                            );
                            return (
                                <li key={r.id}>
                                    <Link
                                        href={`/admin/reservations/${r.id}`}
                                        className={`border-border bg-background hover:border-brand block rounded-2xl border p-4 ${r.overdue ? "border-red-300" : ""}`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-foreground font-extrabold">
                                                {r.code}
                                            </span>
                                            {r.overdue && (
                                                <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                                                    24시간 경과
                                                </span>
                                            )}
                                            {r.urgent && (
                                                <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">
                                                    긴급 · 24시간 미만
                                                </span>
                                            )}
                                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                                                결제 완료
                                            </span>
                                            <span
                                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[notify.tone]}`}
                                            >
                                                {notify.label}
                                            </span>
                                            <span
                                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.acknowledged_at ? TONE.ok : TONE.warn}`}
                                            >
                                                {r.acknowledged_at
                                                    ? "접수 확인함"
                                                    : "접수 미확인"}
                                            </span>
                                        </div>
                                        <p className="text-foreground mt-2 text-sm">
                                            {formatUseDate(r.use_date)}{" "}
                                            {r.arrive_time} ·{" "}
                                            {r.hospital_name || "병원 미입력"} ·{" "}
                                            {r.plan}
                                        </p>
                                        <p className="text-muted-foreground mt-1 text-xs">
                                            결제 후{" "}
                                            {formatElapsed(r.elapsed_minutes)}{" "}
                                            경과
                                        </p>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <section className="mt-8">
                <h2 className="text-foreground text-lg font-bold">
                    환불·실패 안내 추적{" "}
                    {issues.loadError ? "" : `(${issues.rows.length})`}
                </h2>
                {issues.loadError ? (
                    <p
                        role="alert"
                        className="mt-3 text-sm font-bold text-red-600"
                    >
                        추적 목록을 불러오지 못했습니다. 조회 실패는 대기 건이
                        없다는 뜻이 아닙니다.
                    </p>
                ) : issues.rows.length === 0 ? (
                    <p className="text-muted-foreground mt-3 text-sm">
                        처리가 필요한 환불·안내 건이 없습니다.
                    </p>
                ) : (
                    <ul className="mt-3 space-y-3">
                        {issues.rows.map((r) => (
                            <li key={r.reservation_id}>
                                <Link
                                    href={`/admin/reservations/${r.reservation_id}`}
                                    className="border-border bg-background hover:border-brand block rounded-2xl border p-4"
                                >
                                    <p className="font-extrabold">
                                        {r.code} ·{" "}
                                        {r.amount_cash.toLocaleString()}원
                                    </p>
                                    <p className="mt-1 text-sm">
                                        PG 환불:{" "}
                                        <b>
                                            {REFUND_LABEL[r.refund_status] ??
                                                r.refund_status}
                                        </b>
                                        {r.last_error
                                            ? ` · ${r.last_error}`
                                            : ""}
                                    </p>
                                    <p className="text-muted-foreground mt-1 text-xs">
                                        {r.match_failed_at &&
                                        !r.failure_notice_at
                                            ? "고객 실패 안내 미기록 · "
                                            : r.failure_notice_at
                                              ? `고객 안내 완료 · `
                                              : ""}
                                        요청{" "}
                                        {kstDateTime(r.requested_at) ?? "-"}
                                    </p>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

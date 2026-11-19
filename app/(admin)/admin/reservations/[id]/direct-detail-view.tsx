import Link from "next/link";

import {
    ACCEPT_CHANNEL_LABEL,
    FAILURE_NOTICE_METHOD_LABEL,
    canResendIntake,
    directAdminPhase,
    formatElapsed,
    intakeNotifyLabel,
    OVERDUE_HOURS,
    type AcceptChannel,
    type FailureNoticeMethod,
} from "@/lib/direct-admin";
import { formatUseDate, kstDateTime } from "@/lib/format";
import type {
    DirectDetail,
    PartnerCandidate,
} from "../_lib/direct-reservations.server";
import {
    AssignForm,
    FailMatchingForm,
    FailureNoticeForm,
    IntakeControls,
    RefundControls,
} from "./direct-controls";

const EVENT_LABEL: Record<string, string> = {
    PAID: "결제 완료",
    INTAKE_ACKNOWLEDGED: "운영자 접수 확인",
    INTAKE_NOTIFY_REQUEUED: "접수 알림 메일 재발송 요청",
    ASSIGNED: "파트너 배정·확정",
    REASSIGNED: "파트너 재배정",
    CUSTOMER_NOTICE_DONE: "파트너 확정 안내 문자 완료",
    MATCH_FAILED: "매칭 실패 처리",
    FAILURE_NOTICE_DONE: "고객 실패 안내 완료",
    REFUND_REQUESTED: "환불 요청",
    REFUND_PG_FAILED: "PG 취소 실패",
    REFUND_COMPLETED: "환불 완료",
    REFUND_RETRY: "환불 재시도",
    CUSTOMER_CANCELLED: "고객 취소",
};

const REFUND_LABEL: Record<string, string> = {
    REQUESTED: "환불 요청됨 (PG 취소 전)",
    PROCESSING: "PG 취소 처리 중",
    PG_FAILED: "PG 취소 실패 — 재시도 필요",
    REFUNDED: "환불 완료",
};

const TONE: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-800",
    bad: "bg-red-100 text-red-700",
    neutral: "bg-muted text-muted-foreground",
};

function at(iso: string | null | undefined): string {
    return (iso && kstDateTime(iso)) || "-";
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-border bg-background mt-5 rounded-2xl border p-5 md:p-6">
            <h2 className="text-foreground text-lg font-bold">{title}</h2>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
    return (
        <dl className="divide-border divide-y">
            {rows.map(([label, value]) => (
                <div
                    key={label}
                    className="grid gap-1 py-2.5 sm:grid-cols-[150px_1fr] sm:gap-4"
                >
                    <dt className="text-muted-foreground text-sm font-semibold">
                        {label}
                    </dt>
                    <dd className="text-foreground text-sm font-bold break-words whitespace-pre-wrap">
                        {value || "-"}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export function DirectDetailView({
    detail,
    partners,
}: {
    detail: DirectDetail;
    partners: PartnerCandidate[];
}) {
    const r = detail.reservation;
    const phase = directAdminPhase({
        reservationStatus: r.status,
        confirmedPartnerId: r.confirmed_partner_id,
        paidAt: r.paid_at,
        serviceStatus: detail.service?.status ?? null,
        serviceStartedAt: detail.service?.started_at ?? null,
        refundStatus: detail.refund?.status ?? null,
    });
    const elapsedMin = detail.elapsedMinutes ?? null;
    const overdue =
        phase === "ASSIGNABLE" &&
        elapsedMin !== null &&
        elapsedMin > OVERDUE_HOURS * 60;
    const notify = intakeNotifyLabel(
        detail.intake?.notify_status,
        detail.intake?.attempts ?? 0,
    );
    const partnerName = (id: string | null) =>
        partners.find((p) => p.partner_id === id)?.name ??
        (id ? "(파트너)" : "-");
    const refund = detail.refund;
    const refundOpen = refund && refund.status !== "REFUNDED";

    return (
        <div>
            <Link
                href="/admin/reservations"
                className="text-brand text-sm font-bold hover:underline"
            >
                ← 예약 배정 목록
            </Link>
            <h1 className="text-foreground mt-4 text-2xl font-extrabold">
                예약 {r.code}
            </h1>

            {overdue && (
                <p
                    role="alert"
                    className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
                >
                    결제 후 {formatElapsed(elapsedMin)}이 지났습니다. 24시간
                    안에 고객에게 진행 결과를 안내해야 합니다. 자동으로
                    실패·환불 처리되지 않으니 직접 배정하거나 매칭 실패로 처리해
                    주세요.
                </p>
            )}

            <Section title="예약 내용">
                <Rows
                    rows={[
                        [
                            "이용일시",
                            `${formatUseDate(r.use_date)} ${r.arrive_time}`,
                        ],
                        ["병원", String(r.hospital_name ?? "")],
                        ["진료 내용", String(r.treatment ?? "")],
                        ["서비스 유형", String(r.plan)],
                        ["고객 요청사항", String(r.other_requests ?? "")],
                        ["동행 시 주의사항", String(r.cautions ?? "")],
                    ]}
                />
            </Section>

            <Section title="결제·접수">
                <Rows
                    rows={[
                        [
                            "결제 상태",
                            detail.payment?.status === "PAID"
                                ? "결제 완료"
                                : (detail.payment?.status ?? "-"),
                        ],
                        [
                            "결제 금액",
                            detail.payment
                                ? `${detail.payment.gross.toLocaleString()}원`
                                : "-",
                        ],
                        ["결제 시각", at(r.paid_at)],
                        [
                            "경과 시간",
                            phase === "ASSIGNABLE"
                                ? formatElapsed(elapsedMin)
                                : "-",
                        ],
                        [
                            "알림 메일",
                            <span
                                key="n"
                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[notify.tone]}`}
                            >
                                {notify.label}
                            </span>,
                        ],
                        ["메일 발송 시각", at(detail.intake?.sent_at)],
                        ["메일 오류", detail.intake?.last_error ?? ""],
                        [
                            "운영자 접수 확인",
                            detail.intake?.acknowledged_at
                                ? `${at(detail.intake.acknowledged_at)} 확인됨`
                                : "아직 확인하지 않음",
                        ],
                    ]}
                />
                {detail.intake && (
                    <div className="mt-3">
                        <IntakeControls
                            reservationId={r.id}
                            acknowledged={Boolean(
                                detail.intake.acknowledged_at,
                            )}
                            canResend={canResendIntake(
                                detail.intake.notify_status,
                            )}
                        />
                    </div>
                )}
            </Section>

            {(phase === "ASSIGNABLE" || phase === "REASSIGNABLE") && (
                <Section
                    title={
                        phase === "ASSIGNABLE" ? "파트너 배정" : "파트너 재배정"
                    }
                >
                    {phase === "REASSIGNABLE" && (
                        <p className="text-muted-foreground mb-3 text-sm">
                            서비스 시작 전까지만 바꿀 수 있습니다. 이전 담당자는
                            이 예약을 더 이상 볼 수 없고, 새 담당자가 고객에게
                            확정 안내 문자를 다시 보내야 합니다. 현재 담당:{" "}
                            <b>{partnerName(r.confirmed_partner_id)}</b>
                        </p>
                    )}
                    <AssignForm
                        reservationId={r.id}
                        mode={phase === "ASSIGNABLE" ? "ASSIGN" : "REASSIGN"}
                        partners={partners}
                        currentPartnerId={r.confirmed_partner_id}
                    />
                </Section>
            )}
            {phase === "STARTED" && (
                <Section title="파트너 재배정">
                    <p className="text-sm font-semibold text-amber-700">
                        서비스가 이미 시작되었거나 끝나 재배정할 수 없습니다.
                    </p>
                </Section>
            )}

            {phase === "ASSIGNABLE" && (
                <Section title="매칭 실패 · 전액 환불">
                    <p className="text-muted-foreground mb-3 text-sm">
                        배정할 파트너를 찾지 못한 경우에만 사용합니다. 실패
                        처리와 PG 환불은 한 번에 시작되며, 고객 안내는 별도로
                        기록합니다.
                    </p>
                    <FailMatchingForm reservationId={r.id} />
                </Section>
            )}

            {(phase === "REASSIGNABLE" || phase === "STARTED") && (
                <Section title="수락·확정 기록">
                    <Rows
                        rows={[
                            ["파트너", partnerName(r.confirmed_partner_id)],
                            ["수락 확인 시각", at(r.partner_accepted_at)],
                            [
                                "수락 확인 방법",
                                ACCEPT_CHANNEL_LABEL[
                                    r.partner_accepted_channel as AcceptChannel
                                ] ?? "",
                            ],
                            ["수락 메모", r.partner_accepted_memo ?? ""],
                            [
                                "확정 안내 문자(파트너)",
                                r.customer_notice_at
                                    ? `${at(r.customer_notice_at)} 발송 완료`
                                    : "아직 기록되지 않음",
                            ],
                            ["안내 메모", r.customer_notice_memo ?? ""],
                        ]}
                    />
                </Section>
            )}

            {(phase === "FAILED" || refund) && (
                <Section title="매칭 실패 · 환불 상태">
                    <Rows
                        rows={[
                            [
                                "예약 상태",
                                r.status === "CANCELLED"
                                    ? "취소 (매칭 실패·고객 취소)"
                                    : r.status,
                            ],
                            [
                                "PG 환불 상태",
                                refund
                                    ? (REFUND_LABEL[refund.status] ??
                                      refund.status)
                                    : "환불 기록 없음",
                            ],
                            [
                                "환불 금액",
                                refund
                                    ? `${refund.amount_cash.toLocaleString()}원`
                                    : "-",
                            ],
                            ["PG 취소 시각", at(refund?.pg_cancelled_at)],
                            ["PG 오류", refund?.last_error ?? ""],
                            [
                                "고객 실패 안내",
                                r.failure_notice_at
                                    ? `${at(r.failure_notice_at)} · ${
                                          FAILURE_NOTICE_METHOD_LABEL[
                                              r.failure_notice_method as FailureNoticeMethod
                                          ] ?? ""
                                      }`
                                    : r.match_failed_at
                                      ? "아직 안내하지 않음"
                                      : "해당 없음",
                            ],
                            ["안내 메모", r.failure_notice_memo ?? ""],
                        ]}
                    />
                    {refundOpen && (
                        <div className="mt-4">
                            <RefundControls
                                reservationId={r.id}
                                canMarkPg={refund.status === "PG_FAILED"}
                            />
                        </div>
                    )}
                    {r.match_failed_at && !r.failure_notice_at && (
                        <div className="mt-4">
                            <h3 className="mb-2 text-sm font-bold">
                                고객 실패 안내 완료 기록
                            </h3>
                            <FailureNoticeForm reservationId={r.id} />
                        </div>
                    )}
                </Section>
            )}

            <Section title="처리 이력">
                {detail.events.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        이력이 없습니다.
                    </p>
                ) : (
                    <ul className="divide-border divide-y">
                        {detail.events.map((e) => (
                            <li
                                key={e.id}
                                className="flex justify-between gap-4 py-2 text-sm"
                            >
                                <span className="font-semibold">
                                    {EVENT_LABEL[e.event_type] ?? e.event_type}
                                    {e.event_type === "REASSIGNED" &&
                                    e.detail?.previous_partner_id
                                        ? ` (이전: ${partnerName(String(e.detail.previous_partner_id))} → ${partnerName(String(e.detail.partner_id))})`
                                        : ""}
                                </span>
                                <span className="text-muted-foreground shrink-0 text-xs">
                                    {at(e.created_at)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
        </div>
    );
}

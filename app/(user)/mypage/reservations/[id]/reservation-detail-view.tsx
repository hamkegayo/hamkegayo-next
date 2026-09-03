"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    Car,
    Check,
    CheckCircle2,
    ChevronLeft,
    ShieldCheck,
    UserRound,
    XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/modal";
import type { ReservationDetailView } from "../../_lib/detail.server";
import { cancelConfirmedReservation } from "../../_actions/matching";

const STEPS: { label: string; icon: LucideIcon }[] = [
    { label: "파트너 확정", icon: UserRound },
    { label: "서비스 진행", icon: Car },
    { label: "서비스 완료", icon: Check },
];

function Card({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
            <h2 className="text-foreground text-lg font-bold">{title}</h2>
            <div className="mt-5">{children}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex gap-4 py-2 text-sm">
            <span className="text-muted-foreground w-28 shrink-0 font-semibold">
                {label}
            </span>
            <span className="text-foreground min-w-0 flex-1">
                {value || "-"}
            </span>
        </div>
    );
}

export function ReservationDetailView({ r }: { r: ReservationDetailView }) {
    const router = useRouter();
    const [cancelOpen, setCancelOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    const isCancelled = r.status === "CANCELLED";
    const stepTimes = [r.confirmedAtLabel, r.startedAtLabel, r.endedAtLabel];

    const onCancel = () => {
        startTransition(async () => {
            const res = await cancelConfirmedReservation(r.id);
            setCancelOpen(false);
            if (res.ok) {
                toast.success("예약을 취소했습니다.");
                router.push("/mypage");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    return (
        <div>
            {/* 헤더 */}
            <button
                type="button"
                onClick={() => router.push("/mypage")}
                className="text-foreground flex items-center gap-1.5 text-2xl font-extrabold"
            >
                <ChevronLeft className="size-6" />
                예약 상세
            </button>
            <p className="text-muted-foreground mt-2 text-sm">
                예약번호 {r.code} · 예약일 {r.createdAtLabel}
            </p>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                {/* 좌측 */}
                <div className="space-y-5">
                    {/* 서비스 진행 상태 */}
                    <Card title="서비스 진행 상태">
                        {isCancelled ? (
                            <div className="bg-destructive/5 text-destructive flex items-center gap-2 rounded-xl p-4 text-sm font-bold">
                                <XCircle className="size-5" />이 예약은
                                취소되었습니다.
                            </div>
                        ) : (
                            <div className="flex items-start justify-between">
                                {STEPS.map((s, i) => {
                                    const Icon = s.icon;
                                    const done = i <= r.stepIndex;
                                    const active = i === r.stepIndex;
                                    return (
                                        <div
                                            key={s.label}
                                            className="flex flex-1 items-start"
                                        >
                                            <div className="flex flex-1 flex-col items-center gap-2 text-center">
                                                <div
                                                    className={cn(
                                                        "flex size-11 items-center justify-center rounded-full",
                                                        done
                                                            ? "bg-brand text-brand-foreground"
                                                            : "bg-muted text-muted-foreground",
                                                    )}
                                                >
                                                    <Icon className="size-5" />
                                                </div>
                                                <span
                                                    className={cn(
                                                        "text-sm font-semibold",
                                                        done
                                                            ? "text-foreground"
                                                            : "text-muted-foreground",
                                                    )}
                                                >
                                                    {s.label}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "text-xs",
                                                        active
                                                            ? "text-brand"
                                                            : "text-muted-foreground",
                                                    )}
                                                >
                                                    {stepTimes[i] ??
                                                        (active
                                                            ? "진행 중"
                                                            : "예정")}
                                                </span>
                                            </div>
                                            {i < STEPS.length - 1 && (
                                                <div className="bg-border mt-5 h-px flex-1" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    {/* 예약 정보 */}
                    <Card title="예약 정보">
                        <div className="divide-border divide-y">
                            <Row label="예약번호" value={r.code} />
                            <Row label="서비스" value={r.planLabel} />
                            <Row
                                label="병원 방문일시"
                                value={r.hospitalVisitLabel}
                            />
                            <Row
                                label="파트너 도착일시"
                                value={r.partnerArriveLabel}
                            />
                            <Row label="병원" value={r.hospital} />
                            <Row label="출발지" value={r.departAddress} />
                            <Row
                                label="이용자"
                                value={`${r.userName} (${r.userGender} / ${r.userBirth})`}
                            />
                            <Row label="연락처" value={r.userPhone} />
                            <Row label="동행 시 주의점" value={r.cautions} />
                            <Row label="요청사항" value={r.otherRequests} />
                        </div>
                    </Card>

                    {/* 결제 정보 */}
                    <Card
                        title={
                            r.payment.isFinal ? "결제 정보" : "예상 결제 정보"
                        }
                    >
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                    이용요금 ({r.payment.durationLabel})
                                </span>
                                <span className="text-foreground font-semibold">
                                    {r.payment.baseAmount.toLocaleString()}원
                                </span>
                            </div>

                            {r.payment.surchargeAmount > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">
                                        주말·공휴일 할증 30%
                                    </span>
                                    <span className="text-foreground font-semibold">
                                        +
                                        {r.payment.surchargeAmount.toLocaleString()}
                                        원
                                    </span>
                                </div>
                            )}

                            <div className="border-border mt-2 flex items-center justify-between border-t pt-3">
                                <span className="text-foreground font-bold">
                                    {r.payment.isFinal
                                        ? "최종 이용요금"
                                        : "예상 이용요금"}
                                </span>
                                <span className="text-foreground text-lg font-extrabold">
                                    {r.payment.total.toLocaleString()}원
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                    선결제 금액
                                </span>
                                <span className="text-foreground font-semibold">
                                    {r.payment.prepaidAmount.toLocaleString()}원
                                </span>
                            </div>

                            {r.payment.additional > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-destructive font-bold">
                                        추가 결제 필요
                                    </span>
                                    <span className="text-destructive font-extrabold">
                                        {r.payment.additional.toLocaleString()}
                                        원
                                    </span>
                                </div>
                            )}

                            {r.payment.refund > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-brand font-bold">
                                        환불 예정
                                    </span>
                                    <span className="text-brand font-extrabold">
                                        {r.payment.refund.toLocaleString()}원
                                    </span>
                                </div>
                            )}

                            {!r.payment.isFinal && (
                                <p className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed">
                                    선결제 후 서비스가 종료되면 실제
                                    이용시간으로 최종 요금을 산정합니다. 남는
                                    금액은 환불하고, 모자란 금액은 추가결제를
                                    안내드립니다. 최소 1시간분은 청구됩니다.
                                </p>
                            )}
                        </div>
                    </Card>

                    {r.canCancel && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setCancelOpen(true)}
                                disabled={pending}
                                className="border-destructive/40 text-destructive hover:bg-destructive/5 inline-flex items-center gap-1.5 rounded-lg border px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
                            >
                                <XCircle className="size-4" />
                                예약취소하기
                            </button>
                        </div>
                    )}
                </div>

                {/* 우측 */}
                <div className="space-y-5">
                    {/* 파트너 정보 */}
                    {r.partner && (
                        <Card title="파트너 정보">
                            <div className="flex items-center gap-4">
                                <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-full">
                                    <UserRound className="text-muted-foreground size-8" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-foreground text-lg font-bold">
                                        {r.partner.name} 파트너
                                    </p>
                                    {r.partner.rating !== null ? (
                                        <p className="text-muted-foreground mt-0.5 text-sm">
                                            <span className="text-amber-500">
                                                ★
                                            </span>{" "}
                                            {r.partner.rating.toFixed(1)} (후기{" "}
                                            {r.partner.reviewCount}개)
                                        </p>
                                    ) : (
                                        <p className="text-muted-foreground mt-0.5 text-sm">
                                            후기 없음
                                        </p>
                                    )}
                                </div>
                            </div>
                            {r.partner.qualifications.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-1.5">
                                    {r.partner.qualifications.map((q, i) => (
                                        <span
                                            key={i}
                                            className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
                                        >
                                            <ShieldCheck className="size-3" />
                                            {q.type}
                                            {q.issuer ? ` · ${q.issuer}` : ""}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}

                    {/* 서비스 포함 내용 */}
                    <Card title="서비스 포함 내용">
                        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {r.includes.map((it) => (
                                <li
                                    key={it}
                                    className="text-foreground flex items-center gap-2 text-sm"
                                >
                                    <CheckCircle2 className="text-brand size-4 shrink-0" />
                                    {it}
                                </li>
                            ))}
                        </ul>
                    </Card>

                    {/* 안내사항 */}
                    <Card title="안내사항">
                        <ul className="text-muted-foreground space-y-2 text-sm leading-relaxed">
                            <li>
                                서비스 전날 파트너가 연락드려 최종 확인합니다.
                            </li>
                            <li>
                                당일 취소 시 취소 수수료가 발생할 수 있습니다.
                            </li>
                            <li>궁금한 점은 고객센터로 문의해 주세요.</li>
                        </ul>
                    </Card>
                </div>
            </div>

            <ConfirmModal
                open={cancelOpen}
                onClose={() => setCancelOpen(false)}
                onConfirm={onCancel}
                title="예약을 취소할까요?"
                cancelLabel="돌아가기"
                confirmLabel="예약 취소"
                confirmDisabled={pending}
            >
                <p className="text-muted-foreground mt-3 text-left text-sm leading-relaxed">
                    확정된 예약이 취소되며, 배정된 파트너에게 취소가 안내됩니다.
                    되돌릴 수 없습니다.
                </p>
            </ConfirmModal>
        </div>
    );
}

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Car, Check, CheckCircle2, ChevronLeft, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmModal } from "@/components/ui/modal";
import { getReservationDetail } from "../../_lib/mock";

const STEPS: { label: string; icon: LucideIcon }[] = [
    { label: "파트너 확정", icon: UserRound },
    { label: "서비스 진행", icon: Car },
    { label: "서비스 완료", icon: Check },
];

function Card({
    title,
    children,
    className,
}: {
    title?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "border-border bg-background rounded-2xl border p-6 md:p-7",
                className,
            )}
        >
            {title && (
                <h2 className="text-foreground mb-5 text-lg font-bold">
                    {title}
                </h2>
            )}
            {children}
        </div>
    );
}

function InfoRow({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex gap-4 py-1.5 text-sm">
            <span className="text-muted-foreground w-28 shrink-0 font-semibold">
                {label}
            </span>
            <span className="text-foreground">{children}</span>
        </div>
    );
}

export default function ReservationDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const d = getReservationDetail(params.id);

    const [cancelOpen, setCancelOpen] = useState(false);
    const [agreed, setAgreed] = useState(false);

    const notReady = () => toast.info("준비 중인 기능입니다.");

    const onCancel = () => {
        setCancelOpen(false);
        toast.success("예약이 취소되었습니다.");
        router.push("/mypage");
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
                예약번호 {d.shortCode} &nbsp;|&nbsp; 예약일 {d.reservedAt}
            </p>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                {/* 좌측 */}
                <div className="space-y-5">
                    {/* 서비스 진행 상태 */}
                    <Card title="서비스 진행 상태">
                        <div className="flex items-start justify-between">
                            {STEPS.map((s, i) => {
                                const Icon = s.icon;
                                const active = i === d.currentStep;
                                return (
                                    <div
                                        key={s.label}
                                        className="flex flex-1 items-start"
                                    >
                                        <div className="flex flex-1 flex-col items-center gap-2 text-center">
                                            <div
                                                className={cn(
                                                    "flex size-11 items-center justify-center rounded-full",
                                                    active
                                                        ? "bg-brand text-brand-foreground"
                                                        : "border-border bg-background text-muted-foreground border",
                                                )}
                                            >
                                                <Icon className="size-5" />
                                            </div>
                                            <span
                                                className={cn(
                                                    "text-sm font-semibold",
                                                    active
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
                                                {active ? d.stepTime : "예정"}
                                            </span>
                                        </div>
                                        {i < STEPS.length - 1 && (
                                            <div className="bg-border mt-5 h-px flex-1" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </Card>

                    {/* 예약 정보 */}
                    <Card title="예약 정보">
                        <InfoRow label="예약번호">{d.code}</InfoRow>
                        <InfoRow label="서비스">{d.service}</InfoRow>
                        <InfoRow label="병원 방문일시">{d.visitAt}</InfoRow>
                        <InfoRow label="파트너 도착일시">
                            {d.partnerArriveAt}
                        </InfoRow>
                        <InfoRow label="병원">
                            <span className="inline-flex items-center gap-2">
                                {d.hospital}
                                <button
                                    type="button"
                                    onClick={notReady}
                                    className="border-border bg-background text-foreground hover:bg-muted rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors"
                                >
                                    지도보기
                                </button>
                            </span>
                        </InfoRow>
                        <InfoRow label="출발지">{d.departAddress}</InfoRow>
                        <InfoRow label="이용자">{d.patient}</InfoRow>
                        <InfoRow label="연락처">{d.phone}</InfoRow>
                        <InfoRow label="동행 시 주의점">{d.cautions}</InfoRow>
                        <InfoRow label="요청사항">{d.requests}</InfoRow>
                    </Card>

                    {/* 결제 정보 */}
                    <Card title="결제 정보">
                        <div className="flex items-center justify-between py-1.5 text-sm">
                            <span className="text-muted-foreground">
                                서비스 금액
                            </span>
                            <span className="text-foreground font-semibold">
                                {d.payment.service.toLocaleString()}원
                            </span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 text-sm">
                            <span className="text-muted-foreground">
                                추가 옵션
                            </span>
                            <span className="text-foreground font-semibold">
                                {d.payment.extra.toLocaleString()}원
                            </span>
                        </div>
                        <div className="bg-border my-3 h-px" />
                        <div className="flex items-center justify-between text-base">
                            <span className="text-foreground font-bold">
                                총 결제 금액
                            </span>
                            <span className="text-foreground font-extrabold">
                                {d.payment.total.toLocaleString()}원
                            </span>
                        </div>
                    </Card>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => {
                                setAgreed(false);
                                setCancelOpen(true);
                            }}
                            className="border-destructive/40 bg-background text-destructive hover:bg-destructive/5 rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                        >
                            예약취소하기
                        </button>
                    </div>
                </div>

                {/* 우측 */}
                <div className="space-y-5">
                    {/* 파트너 정보 */}
                    <Card title="파트너 정보">
                        <div className="flex gap-4">
                            <div className="bg-muted size-16 shrink-0 rounded-full" />
                            <div className="min-w-0">
                                <p className="text-foreground font-bold">
                                    {d.partner.name}
                                </p>
                                <p className="text-foreground mt-1 text-sm font-semibold">
                                    <span className="text-amber-500">★</span>{" "}
                                    {d.partner.rating}{" "}
                                    <span className="text-muted-foreground font-normal">
                                        (후기 {d.partner.reviewCount}개)
                                    </span>
                                </p>
                                <p className="text-muted-foreground mt-1 text-sm">
                                    {d.partner.meta}
                                </p>
                                <p className="text-muted-foreground mt-0.5 text-sm">
                                    {d.partner.tags}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                onClick={notReady}
                                className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-3 py-2 text-sm font-bold transition-colors"
                            >
                                파트너 프로필 보기
                            </button>
                            <button
                                type="button"
                                onClick={notReady}
                                className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-3 py-2 text-sm font-bold transition-colors"
                            >
                                메시지 보내기
                            </button>
                        </div>
                    </Card>

                    {/* 서비스 포함 내용 */}
                    <Card title="서비스 포함 내용">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {d.included.map((item) => (
                                <div
                                    key={item}
                                    className="text-foreground flex items-center gap-2 text-sm"
                                >
                                    <CheckCircle2 className="text-brand size-4 shrink-0" />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* 안내사항 */}
                    <Card title="안내사항">
                        <ul className="text-muted-foreground space-y-2 text-sm leading-relaxed">
                            {d.notices.map((n) => (
                                <li key={n}>{n}</li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            onClick={notReady}
                            className="border-border bg-background text-foreground hover:bg-muted mt-4 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors"
                        >
                            취소 및 환불 규정 보기
                        </button>
                    </Card>
                </div>
            </div>

            {/* 예약 취소 확인 모달 */}
            <ConfirmModal
                open={cancelOpen}
                onClose={() => setCancelOpen(false)}
                onConfirm={onCancel}
                title="예약 취소를 진행하시겠습니까?"
                cancelLabel="돌아가기"
                confirmLabel="예약 취소"
                tone="destructive"
                confirmDisabled={!agreed}
            >
                <div className="bg-muted/50 mt-5 rounded-xl px-4 py-3 text-left text-sm">
                    <div className="flex gap-3 py-1">
                        <span className="text-muted-foreground w-12 shrink-0 font-semibold">
                            예약일
                        </span>
                        <span className="text-foreground font-bold">
                            {d.reservedAt} 오전 10:00
                        </span>
                    </div>
                    <div className="flex gap-3 py-1">
                        <span className="text-muted-foreground w-12 shrink-0 font-semibold">
                            파트너
                        </span>
                        <span className="text-foreground font-bold">
                            {d.partner.name}
                        </span>
                    </div>
                </div>

                <p className="text-muted-foreground mt-4 text-left text-sm leading-relaxed">
                    예약 취소 시 배정된 파트너가 자동으로 취소되며,
                    <br />
                    <span className="text-destructive font-semibold">
                        취소 규정에 따라 수수료가 발생할 수 있습니다.
                    </span>
                </p>

                <label className="border-destructive/30 bg-destructive/5 mt-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-left">
                    <Checkbox
                        checked={agreed}
                        onCheckedChange={(c) => setAgreed(c === true)}
                    />
                    <span className="text-foreground text-sm font-medium">
                        위 안내에 동의합니다.
                    </span>
                </label>
            </ConfirmModal>
        </div>
    );
}

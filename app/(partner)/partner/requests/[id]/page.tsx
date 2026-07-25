"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
    Bell,
    Building2,
    CalendarDays,
    Check,
    CircleX,
    Clock,
    CreditCard,
    House,
    List,
    Pill,
    UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { getPartnerRequest, type ScheduleStep } from "../../../_lib/requests";
import { RejectRequestModal } from "../../../_components/reject-request-modal";

const STEP_ICON: Record<ScheduleStep["kind"], LucideIcon> = {
    home: House,
    hospital: Building2,
    pharmacy: Pill,
};

function Card({
    title,
    icon: Icon,
    children,
}: {
    title: string;
    icon: LucideIcon;
    children: React.ReactNode;
}) {
    return (
        <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
            <h2 className="text-foreground flex items-center gap-2 text-lg font-bold">
                <Icon className="text-brand size-5" />
                {title}
            </h2>
            <div className="mt-5">{children}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2 text-sm">
            <span className="text-muted-foreground shrink-0">{label}</span>
            <span className="text-foreground text-right font-bold">
                {value}
            </span>
        </div>
    );
}

function BulletRow({ label, items }: { label: string; items: string[] }) {
    return (
        <div className="flex gap-4 py-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">{label}</span>
            <ul className="flex-1 space-y-1.5">
                {items.map((it) => (
                    <li key={it} className="text-foreground flex gap-2">
                        <span className="bg-brand mt-1.5 size-1 shrink-0 rounded-full" />
                        {it}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function PartnerRequestDetail() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const r = getPartnerRequest(params.id);

    const [rejectOpen, setRejectOpen] = useState(false);

    if (!r) {
        return (
            <div className="border-border bg-background rounded-2xl border p-10 text-center">
                <p className="text-muted-foreground">
                    요청을 찾을 수 없습니다.
                </p>
                <Link
                    href="/partner/requests"
                    className="text-brand mt-4 inline-block text-sm font-bold"
                >
                    수락 대기 목록으로
                </Link>
            </div>
        );
    }

    const isPlus = r.plan === "Plus";
    const notReady = () => toast.info("준비 중인 기능입니다.");

    const onAccept = () => {
        toast.success("요청을 수락했습니다. 일정이 확정되었습니다.");
        router.push("/partner/requests");
    };

    const onReject = () => {
        setRejectOpen(false);
        toast.success("요청을 거절했습니다.");
        router.push("/partner/requests");
    };

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-muted-foreground text-sm font-semibold">
                        서비스 요청 &gt; 수락 대기 목록 &gt;{" "}
                        <span className="text-brand">서비스 요청 상세</span>
                    </p>
                    <h1 className="text-foreground mt-2 text-2xl font-extrabold md:text-3xl">
                        서비스 요청 상세
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        아래 요청 내용을 확인하고 수락/거절해 주세요.
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Link
                        href="/partner/requests"
                        className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors"
                    >
                        <List className="size-4" />
                        수락 대기 목록
                    </Link>
                    <button
                        type="button"
                        onClick={notReady}
                        className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors"
                    >
                        <Bell className="size-4" />
                        알림 설정
                    </button>
                </div>
            </div>

            {/* 요약 카드 */}
            <div className="border-border bg-background mt-6 rounded-2xl border p-6 md:p-7">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-bold",
                            isPlus
                                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
                                : "bg-blue-100 text-blue-600 dark:bg-blue-500/15",
                        )}
                    >
                        {r.plan.toUpperCase()}
                    </span>
                    <h2 className="text-foreground text-xl font-extrabold">
                        {r.hospital} {r.type}
                    </h2>
                </div>

                <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex flex-wrap gap-x-10 gap-y-5">
                        <SummaryItem
                            icon={CalendarDays}
                            label="병원 예약 시간"
                            value={r.hospitalTime}
                            sub={r.hospitalDate}
                        />
                        <SummaryItem
                            icon={UserRound}
                            label="파트너 도착 희망 시간"
                            value={r.arriveTime}
                            sub={r.arriveDate}
                        />
                        <SummaryItem
                            icon={Clock}
                            label="예상 소요 시간"
                            value={r.estDuration}
                        />
                        <SummaryItem
                            icon={CreditCard}
                            label="예상 정산 금액"
                            value={`${r.amount.toLocaleString()}원`}
                            sub="(기본 요금 포함)"
                            valueClass="text-brand"
                        />
                    </div>

                    <div className="shrink-0 text-center">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onAccept}
                                className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-xl px-5 py-3 transition-colors"
                            >
                                <span className="flex items-center justify-center gap-1.5 font-bold">
                                    <Check className="size-4" strokeWidth={3} />
                                    수락하기
                                </span>
                                <span className="mt-0.5 block text-xs opacity-90">
                                    요청을 수락하고 일정 확정
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setRejectOpen(true)}
                                className="border-destructive/40 bg-background text-destructive hover:bg-destructive/5 rounded-xl border px-5 py-3 transition-colors"
                            >
                                <span className="flex items-center justify-center gap-1.5 font-bold">
                                    <CircleX className="size-4" />
                                    거절하기
                                </span>
                                <span className="text-muted-foreground mt-0.5 block text-xs">
                                    요청을 거절합니다.
                                </span>
                            </button>
                        </div>
                        <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1.5 text-sm">
                            <Clock className="size-4" />
                            {r.responseBy}
                        </p>
                    </div>
                </div>
            </div>

            {/* 서비스 정보 / 고객 정보 */}
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Card title="서비스 정보" icon={CalendarDays}>
                    <div className="divide-border divide-y">
                        <Row label="예약 번호" value={r.code} />
                        <Row label="서비스 유형" value={r.serviceType} />
                        <Row label="병원" value={r.hospital} />
                        <Row
                            label="병원 예약 시간"
                            value={`${r.hospitalDate} ${r.hospitalTime}`}
                        />
                        <Row
                            label="파트너 도착 희망 시간"
                            value={`${r.arriveDate} ${r.arriveTime}`}
                        />
                        <Row label="예상 소요 시간" value={r.estDuration} />
                        <Row label="출발지" value={r.departure} />
                    </div>

                    <p className="text-foreground mt-5 text-sm font-bold">
                        이동 일정 요약
                    </p>
                    <div className="mt-3 space-y-1">
                        {r.schedule.map((s) => {
                            const Icon = STEP_ICON[s.kind];
                            return (
                                <div
                                    key={s.no}
                                    className="flex items-center gap-3 py-1.5"
                                >
                                    <span className="bg-brand/10 text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
                                        <Icon className="size-4" />
                                    </span>
                                    <span className="text-foreground text-sm font-bold">
                                        {s.no}
                                    </span>
                                    <span className="text-foreground min-w-0 flex-1 text-sm">
                                        {s.label}
                                    </span>
                                    <span className="text-muted-foreground shrink-0 text-sm">
                                        {s.time}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <p className="bg-muted/40 text-muted-foreground mt-3 rounded-lg px-4 py-2.5 text-xs">
                        위 일정은 예상 시간으로 상황에 따라 변동될 수 있습니다.
                    </p>
                </Card>

                <Card title="고객 정보" icon={UserRound}>
                    <div className="divide-border divide-y">
                        <Row label="이용자 이름" value={r.customer.name} />
                        <Row label="나이" value={r.customer.age} />
                        <Row label="성별" value={r.customer.gender} />
                        <Row label="예약된 진료" value={r.customer.treatment} />
                        <Row label="진료 목적" value={r.customer.purpose} />
                    </div>
                    <div className="divide-border mt-3 divide-y">
                        <BulletRow
                            label="동행 시 주의할 점"
                            items={r.customer.cautions}
                        />
                        <BulletRow
                            label="요청사항"
                            items={r.customer.requests}
                        />
                    </div>
                </Card>
            </div>

            <RejectRequestModal
                open={rejectOpen}
                onClose={() => setRejectOpen(false)}
                onConfirm={onReject}
            />
        </div>
    );
}

function SummaryItem({
    icon: Icon,
    label,
    value,
    sub,
    valueClass,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    sub?: string;
    valueClass?: string;
}) {
    return (
        <div>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Icon className="text-brand size-4" />
                {label}
            </p>
            <p
                className={cn(
                    "text-foreground mt-2 text-xl font-extrabold",
                    valueClass,
                )}
            >
                {value}
            </p>
            {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
        </div>
    );
}

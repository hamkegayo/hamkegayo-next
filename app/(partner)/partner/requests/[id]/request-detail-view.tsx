"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Bell,
    CalendarDays,
    Check,
    CircleX,
    Clock,
    CreditCard,
    List,
    UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { PartnerRequestDetail } from "../../../_lib/requests.server";
import { RejectRequestModal } from "../../../_components/reject-request-modal";
import { acceptRequest, rejectRequest } from "../../_actions/requests";

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

export function RequestDetailView({ r }: { r: PartnerRequestDetail }) {
    const router = useRouter();
    const [rejectOpen, setRejectOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    const isPlus = r.plan === "Plus";
    const notReady = () => toast.info("준비 중인 기능입니다.");

    const onAccept = () => {
        startTransition(async () => {
            const res = await acceptRequest(r.id);
            if (res.ok) {
                toast.success("요청을 수락했습니다.");
                router.push("/partner/requests");
            } else {
                toast.error(res.message);
            }
        });
    };

    const onReject = (reason: string, note: string) => {
        startTransition(async () => {
            const res = await rejectRequest(r.id, reason, note);
            setRejectOpen(false);
            if (res.ok) {
                toast.success("요청을 거절했습니다.");
                router.push("/partner/requests");
            } else {
                toast.error(res.message);
            }
        });
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
                        {r.hospital}
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

                    <div className="shrink-0">
                        {r.canAct ? (
                            <>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={onAccept}
                                        disabled={pending}
                                        className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-xl px-5 py-3 transition-colors disabled:opacity-60"
                                    >
                                        <span className="flex items-center justify-center gap-1.5 font-bold">
                                            <Check
                                                className="size-4"
                                                strokeWidth={3}
                                            />
                                            수락하기
                                        </span>
                                        <span className="mt-0.5 block text-xs opacity-90">
                                            요청을 수락하고 일정 확정
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRejectOpen(true)}
                                        disabled={pending}
                                        className="border-destructive/40 bg-background text-destructive hover:bg-destructive/5 rounded-xl border px-5 py-3 transition-colors disabled:opacity-60"
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
                                    빠른 응답 부탁드립니다.
                                </p>
                            </>
                        ) : (
                            <div className="border-border bg-muted/30 text-muted-foreground rounded-xl border px-5 py-4 text-center text-sm font-bold">
                                이미 처리한 요청입니다.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 서비스 정보 / 고객 정보 */}
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
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
                        <Row label="출발지 지역" value={r.departRegion} />
                    </div>
                </Card>

                {/*
                 * 매칭 전에는 수행 가능 여부 판단에 필요한 최소 정보만 보인다.
                 * 이용자 성명·연락처·상세주소·진료내용은 예약이 확정된 뒤 열린다.
                 * — 개인정보처리방침 제5조 ②③④
                 */}
                <Card title="수행 조건" icon={UserRound}>
                    <div className="divide-border divide-y">
                        <Row label="거동 상태" value={r.condition.mobility} />
                        <Row label="인지 상태" value={r.condition.cognitive} />
                        <Row label="병원 지역" value={r.hospitalRegion} />
                    </div>
                    <p className="text-muted-foreground border-border mt-4 rounded-xl border border-dashed px-4 py-3 text-xs leading-relaxed">
                        이용자 성명·연락처와 상세 주소, 진료 내용은 개인정보
                        보호를 위해 <b>예약이 확정된 후</b>에 확인할 수 있어요.
                    </p>
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

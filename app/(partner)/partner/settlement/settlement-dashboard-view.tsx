"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, ReceiptText, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import type { Settlement, SettlementSummary } from "../../_lib/settlement";
import { AccountChangeModal } from "../../_components/account-change-modal";
import { SettlementDetailModal } from "../../_components/settlement-detail-modal";

const HISTORY = "/partner/settlement/history";

// 계좌·정산일은 아직 DB 소스가 없어 정적 표시(연동은 범위 밖)
const ACCOUNT = { display: "국민 1234-**-7890", lastChanged: "2025.05.01" };
const NEXT_PAYOUT = "매월 15일";

const QUICK_MENU: {
    icon: LucideIcon;
    title: string;
    desc: string;
    href: string | null;
}[] = [
    {
        icon: FileText,
        title: "완료 목록",
        desc: "전체 완료 건을 확인할 수 있습니다.",
        href: HISTORY,
    },
    {
        icon: Star,
        title: "후기 확인",
        desc: "이용자 후기를 확인할 수 있습니다.",
        href: null,
    },
    {
        icon: ReceiptText,
        title: "정산 상태",
        desc: "지급 예정 및 지급 완료 상태를 확인할 수 있습니다.",
        href: HISTORY,
    },
];

export function SettlementDashboardView({
    settlements,
    summary,
}: {
    settlements: Settlement[];
    summary: SettlementSummary;
}) {
    const s = summary;
    const [account, setAccount] = useState(ACCOUNT.display);
    const [accountOpen, setAccountOpen] = useState(false);
    const [selected, setSelected] = useState<Settlement | null>(null);

    const recent = settlements.slice(0, 4);

    return (
        <div>
            {/* 헤더 */}
            <div className="flex items-start justify-between gap-4">
                <h1 className="text-2xl font-extrabold md:text-3xl">
                    <span className="text-foreground">My</span>
                    <span className="text-brand">/정산</span>
                </h1>
                <Link
                    href={HISTORY}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors"
                >
                    이번 달 정산
                </Link>
            </div>

            {/* 상단 통계 */}
            <div className="divide-border border-border bg-background mt-6 grid grid-cols-1 divide-y rounded-2xl border p-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:p-8">
                <div className="pb-4 sm:pr-8 sm:pb-0">
                    <p className="text-muted-foreground text-sm">예상 정산</p>
                    <p className="text-brand mt-2 text-3xl font-extrabold">
                        {s.totalAmount.toLocaleString()}원
                    </p>
                </div>
                <div className="py-4 sm:px-8 sm:py-0">
                    <p className="text-muted-foreground text-sm">완료 건수</p>
                    <p className="text-foreground mt-2 text-3xl font-extrabold">
                        {s.serviceCount}건
                    </p>
                </div>
                <div className="pt-4 sm:pt-0 sm:pl-8">
                    <p className="text-muted-foreground text-sm">다음 정산일</p>
                    <p className="text-foreground mt-2 text-3xl font-extrabold">
                        {NEXT_PAYOUT}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                        지급 예정
                    </p>
                </div>
            </div>

            {/* 3열: 정산 관리 / 최근 정산 내역 / 자주 사용하는 메뉴 */}
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                {/* 정산 관리 */}
                <section className="border-border bg-background rounded-2xl border p-6">
                    <h2 className="text-foreground text-center text-lg font-bold">
                        정산 관리
                    </h2>
                    <div className="mt-5 space-y-4 text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">
                                정산 계좌
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="text-foreground font-bold">
                                    {account}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAccountOpen(true)}
                                    className="border-brand text-brand hover:bg-brand/5 rounded-md border px-2 py-1 text-xs font-bold transition-colors"
                                >
                                    계좌 변경
                                </button>
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                                마지막 변경일
                            </span>
                            <span className="text-foreground font-bold">
                                {ACCOUNT.lastChanged}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                                정산 완료
                            </span>
                            <span className="text-foreground font-bold">
                                {s.serviceCount}건 완료
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                                다음 정산일
                            </span>
                            <span className="text-foreground font-bold">
                                {NEXT_PAYOUT}
                            </span>
                        </div>
                    </div>
                    <div className="bg-brand/5 mt-5 flex items-center justify-between rounded-xl px-4 py-3.5">
                        <span className="text-brand text-sm font-bold">
                            실수령 예정액
                        </span>
                        <span className="text-brand text-xl font-extrabold">
                            {s.totalNet.toLocaleString()}원
                        </span>
                    </div>
                </section>

                {/* 최근 정산 내역 */}
                <section className="border-border bg-background rounded-2xl border p-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-foreground text-lg font-bold">
                            최근 정산 내역
                        </h2>
                        <Link
                            href={HISTORY}
                            className="border-border text-muted-foreground hover:bg-muted rounded-md border px-2.5 py-1 text-xs font-bold transition-colors"
                        >
                            전체 보기
                        </Link>
                    </div>
                    <ul className="divide-border mt-4 divide-y">
                        {recent.map((r) => (
                            <li key={r.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelected(r)}
                                    className="hover:bg-muted/30 flex w-full items-center gap-3 py-3 text-left transition-colors"
                                >
                                    <span className="text-muted-foreground w-12 shrink-0 text-sm font-bold">
                                        {r.serviceDate.slice(5, 10)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-foreground font-bold">
                                            {r.hospital}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            {r.plan} 서비스
                                        </p>
                                    </div>
                                    <span className="text-foreground shrink-0 font-bold">
                                        {r.amount?.toLocaleString()}원
                                    </span>
                                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* 자주 사용하는 메뉴 */}
                <section className="border-border bg-background rounded-2xl border p-6">
                    <h2 className="text-foreground text-center text-lg font-bold">
                        자주 사용하는 메뉴
                    </h2>
                    <ul className="mt-4 space-y-3">
                        {QUICK_MENU.map(({ icon: Icon, title, desc, href }) => {
                            const inner = (
                                <>
                                    <span className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                                        <Icon className="size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-foreground font-bold">
                                            {title}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            {desc}
                                        </p>
                                    </div>
                                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                                </>
                            );
                            const cls =
                                "flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/30";
                            return (
                                <li key={title}>
                                    {href ? (
                                        <Link href={href} className={cls}>
                                            {inner}
                                        </Link>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                toast.info(
                                                    "준비 중인 기능입니다.",
                                                )
                                            }
                                            className={cls}
                                        >
                                            {inner}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            </div>

            <AccountChangeModal
                open={accountOpen}
                onClose={() => setAccountOpen(false)}
                onChange={(bank, acc) => {
                    setAccount(`${bank} ${acc}`);
                    toast.success("정산 계좌가 변경되었습니다.");
                }}
            />
            <SettlementDetailModal
                open={selected !== null}
                onClose={() => setSelected(null)}
                settlement={selected}
            />
        </div>
    );
}

"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, UserRound } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

type PointType = "적립" | "사용" | "소멸";
type PointRow = {
    date: string;
    type: PointType;
    amount: number;
    balance: number;
};

const HISTORY: PointRow[] = [
    { date: "2026.05.01", type: "적립", amount: 2500, balance: 12500 },
    { date: "2026.04.18", type: "사용", amount: -3000, balance: 10000 },
    { date: "2026.04.02", type: "적립", amount: 2500, balance: 13000 },
    { date: "2026.03.15", type: "적립", amount: 1200, balance: 10500 },
    { date: "2026.03.01", type: "소멸", amount: -500, balance: 9300 },
    { date: "2026.02.20", type: "적립", amount: 2000, balance: 9800 },
    { date: "2026.02.05", type: "사용", amount: -1500, balance: 7800 },
    { date: "2026.01.22", type: "적립", amount: 3000, balance: 9300 },
    { date: "2026.01.10", type: "적립", amount: 1000, balance: 6300 },
    { date: "2025.12.28", type: "사용", amount: -2000, balance: 5300 },
    { date: "2025.12.15", type: "적립", amount: 2500, balance: 7300 },
    { date: "2025.12.01", type: "소멸", amount: -1000, balance: 4800 },
    { date: "2025.11.20", type: "적립", amount: 1800, balance: 5800 },
];

const TABS = ["전체", "적립", "사용", "소멸"] as const;
const PAGE_SIZE = 5;

function PCoin({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                "flex items-center justify-center rounded-full bg-amber-400 font-extrabold text-white shadow-sm",
                className,
            )}
        >
            P
        </span>
    );
}

function signed(amount: number) {
    return `${amount > 0 ? "+" : "-"}${Math.abs(amount).toLocaleString()} P`;
}

export default function MypagePoints() {
    const [tab, setTab] = useState<(typeof TABS)[number]>("전체");
    const [page, setPage] = useState(1);

    const filtered = useMemo(
        () =>
            tab === "전체" ? HISTORY : HISTORY.filter((h) => h.type === tab),
        [tab],
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const changeTab = (t: (typeof TABS)[number]) => {
        setTab(t);
        setPage(1);
    };

    const notReady = () => toast.info("준비 중인 기능입니다.");

    return (
        <div>
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                내 포인트
            </h1>

            {/* 보유 포인트 */}
            <h2 className="text-foreground mt-8 text-lg font-bold">
                보유 포인트
            </h2>
            <div className="border-border bg-background sm:divide-border mt-4 grid gap-4 rounded-2xl border p-6 sm:grid-cols-[1.4fr_1fr] sm:gap-0 sm:divide-x">
                <div className="flex items-center gap-4">
                    <PCoin className="size-14 text-2xl" />
                    <div>
                        <p className="text-muted-foreground text-sm">
                            사용 가능한 포인트
                        </p>
                        <p className="text-3xl font-extrabold text-amber-500">
                            12,500 <span className="text-lg">P</span>
                        </p>
                    </div>
                </div>
                <div className="flex flex-col justify-center gap-3 sm:pl-8">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                            적립예정 포인트
                        </span>
                        <span className="text-foreground font-bold">
                            1,200 P
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                            소멸예정 포인트
                        </span>
                        <span className="text-foreground font-bold">0 P</span>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                {/* 포인트 내역 */}
                <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                    <h2 className="text-foreground text-lg font-bold">
                        포인트 내역
                    </h2>

                    {/* 탭 */}
                    <div className="border-border mt-4 flex gap-5 border-b">
                        {TABS.map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => changeTab(t)}
                                className={cn(
                                    "-mb-px border-b-2 pb-2 text-sm font-semibold transition-colors",
                                    tab === t
                                        ? "border-brand text-foreground"
                                        : "text-muted-foreground hover:text-foreground border-transparent",
                                )}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    {/* 표 */}
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-border text-muted-foreground border-b text-left">
                                    <th className="py-2.5 pr-3 font-semibold">
                                        날짜
                                    </th>
                                    <th className="py-2.5 pr-3 font-semibold">
                                        구분
                                    </th>
                                    <th className="py-2.5 pr-3 text-right font-semibold">
                                        포인트
                                    </th>
                                    <th className="py-2.5 text-right font-semibold">
                                        잔액
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="text-muted-foreground py-10 text-center"
                                        >
                                            내역이 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((r, i) => (
                                        <tr
                                            key={`${r.date}-${i}`}
                                            className="border-border border-b"
                                        >
                                            <td className="text-foreground py-3.5 pr-3">
                                                {r.date}
                                            </td>
                                            <td className="text-muted-foreground py-3.5 pr-3">
                                                {r.type}
                                            </td>
                                            <td
                                                className={cn(
                                                    "py-3.5 pr-3 text-right font-bold",
                                                    r.amount > 0
                                                        ? "text-emerald-600"
                                                        : "text-destructive",
                                                )}
                                            >
                                                {signed(r.amount)}
                                            </td>
                                            <td className="text-foreground py-3.5 text-right font-semibold">
                                                {r.balance.toLocaleString()} P
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* 페이지네이션 */}
                    {totalPages > 1 && (
                        <div className="mt-4 flex items-center justify-center gap-1.5">
                            <button
                                type="button"
                                onClick={() =>
                                    setPage((p) => Math.max(1, p - 1))
                                }
                                disabled={page === 1}
                                className="border-border text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-md border transition-colors disabled:opacity-40"
                                aria-label="이전 페이지"
                            >
                                <ChevronLeft className="size-4" />
                            </button>
                            {Array.from({ length: totalPages }).map((_, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setPage(i + 1)}
                                    className={cn(
                                        "flex size-8 items-center justify-center rounded-md text-sm font-semibold transition-colors",
                                        page === i + 1
                                            ? "bg-brand text-brand-foreground"
                                            : "border-border text-foreground hover:bg-muted border",
                                    )}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() =>
                                    setPage((p) => Math.min(totalPages, p + 1))
                                }
                                disabled={page === totalPages}
                                className="border-border text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-md border transition-colors disabled:opacity-40"
                                aria-label="다음 페이지"
                            >
                                <ChevronRight className="size-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* 우측: 안내 + 소멸 예정 */}
                <div className="space-y-5">
                    <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h2 className="text-foreground flex items-center gap-2 text-lg font-bold">
                            <PCoin className="size-5 text-xs" />
                            포인트 안내
                        </h2>

                        <div className="mt-5 space-y-5">
                            <div>
                                <p className="text-foreground flex items-center gap-2 font-bold">
                                    <UserRound className="text-muted-foreground size-4" />
                                    적립방법
                                </p>
                                <ul className="text-muted-foreground mt-2 space-y-1 pl-6 text-sm">
                                    <li>서비스 이용 시 결제 금액의 1% 적립</li>
                                    <li>이벤트 참여 시 추가 적립</li>
                                </ul>
                            </div>
                            <div>
                                <p className="text-foreground flex items-center gap-2 font-bold">
                                    <CreditCard className="text-muted-foreground size-4" />
                                    사용방법
                                </p>
                                <ul className="text-muted-foreground mt-2 space-y-1 pl-6 text-sm">
                                    <li>예약 결제 시 포인트 사용 가능</li>
                                    <li>1P = 1원으로 사용 가능</li>
                                </ul>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={notReady}
                            className="border-border bg-background text-foreground hover:bg-muted mt-6 w-full rounded-lg border py-2.5 text-sm font-bold transition-colors"
                        >
                            자세히 보기
                        </button>
                    </div>

                    <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h2 className="text-foreground text-lg font-bold">
                            소멸 예정 포인트
                        </h2>
                        <div className="mt-6 text-center">
                            <p className="text-foreground font-bold">
                                소멸 예정 포인트가 없습니다.
                            </p>
                            <p className="text-muted-foreground mt-1 text-sm">
                                유효기간이 지나면 포인트가 자동으로 소멸됩니다.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

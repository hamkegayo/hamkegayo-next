"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    ClipboardCheck,
    FileText,
    Headphones,
    Home,
    Users,
    Wallet,
    X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePartnerNav } from "./partner-nav-context";

const ITEMS: {
    href: string;
    label: string;
    icon: LucideIcon;
}[] = [
    { href: "/partner", label: "홈", icon: Home },
    { href: "/partner/requests", label: "서비스 요청", icon: Users },
    { href: "/partner/management", label: "진행 관리", icon: ClipboardCheck },
    { href: "/partner/reports", label: "리포트 작성", icon: FileText },
    { href: "/partner/settlement", label: "정산 관리", icon: Wallet },
];

/** 실데이터 카운트 (0이면 뱃지 숨김) */
export type PartnerNavCounts = {
    requestCount: number;
    managementCount: number;
    reportCount: number;
};

/** 네비게이션 항목 + 고객센터 (데스크톱 사이드바 / 모바일 드로워 공용) */
function SidebarContent({
    onNavigate,
    counts,
}: {
    onNavigate?: () => void;
    counts: PartnerNavCounts;
}) {
    const pathname = usePathname();

    // 경로별 실데이터 뱃지 (0이면 숨김)
    const badgeFor = (href: string): number | undefined => {
        const n =
            href === "/partner/requests"
                ? counts.requestCount
                : href === "/partner/management"
                  ? counts.managementCount
                  : href === "/partner/reports"
                    ? counts.reportCount
                    : 0;
        return n > 0 ? n : undefined;
    };

    return (
        <>
            <nav className="flex flex-col gap-1">
                {ITEMS.map(({ href, label, icon: Icon }) => {
                    const badge = badgeFor(href);
                    // 홈은 정확 일치, 나머지는 하위 경로(상세 등)도 활성 처리
                    const active =
                        pathname === href ||
                        (href !== "/partner" &&
                            pathname.startsWith(`${href}/`));
                    return (
                        <Link
                            key={href}
                            href={href}
                            onClick={onNavigate}
                            className={cn(
                                "flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
                                active
                                    ? "bg-brand/10 text-brand"
                                    : "text-foreground hover:bg-muted",
                            )}
                        >
                            <Icon className="size-4" />
                            <span className="flex-1">{label}</span>
                            {badge && (
                                <span className="bg-destructive flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white">
                                    {badge}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* 파트너 고객센터 — 하단 고정 */}
            <div className="border-border bg-background mt-auto rounded-2xl border p-5">
                <p className="text-foreground flex items-center gap-2 font-bold">
                    <Headphones className="text-brand size-4" />
                    파트너 고객센터
                </p>
                <p className="text-foreground mt-3 text-xl font-extrabold">
                    02-1234-5678
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                    평일 09:00 ~ 18:00
                </p>
            </div>
        </>
    );
}

export function PartnerSidebar({ counts }: { counts: PartnerNavCounts }) {
    const { open, setOpen } = usePartnerNav();

    // 드로워 열림 동안 배경 스크롤 잠금
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    return (
        <>
            {/* 데스크톱 고정 사이드바 */}
            <aside className="border-border bg-background fixed top-16 bottom-0 left-0 z-30 hidden w-56 flex-col overflow-y-auto border-r px-4 py-6 md:flex">
                <SidebarContent counts={counts} />
            </aside>

            {/* 모바일 드로워 (오버레이 + 좌측 슬라이드) */}
            <div
                className={cn(
                    "fixed inset-0 z-50 md:hidden",
                    open ? "" : "pointer-events-none",
                )}
                aria-hidden={!open}
            >
                {/* 오버레이 */}
                <div
                    onClick={() => setOpen(false)}
                    className={cn(
                        "absolute inset-0 bg-black/40 transition-opacity duration-200",
                        open ? "opacity-100" : "opacity-0",
                    )}
                />

                {/* 패널 */}
                <aside
                    className={cn(
                        "border-border bg-background absolute top-0 bottom-0 left-0 flex w-72 max-w-[82%] flex-col overflow-y-auto border-r px-4 py-4 shadow-xl transition-transform duration-200",
                        open ? "translate-x-0" : "-translate-x-full",
                    )}
                >
                    {/* 상단: 타이틀 + 닫기 */}
                    <div className="mb-2 flex items-center justify-between px-2">
                        <span className="text-foreground text-lg font-extrabold">
                            함께가요 <span className="text-brand">Partner</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="메뉴 닫기"
                            className="text-foreground hover:bg-muted flex size-9 items-center justify-center rounded-lg transition-colors"
                        >
                            <X className="size-5" />
                        </button>
                    </div>

                    <SidebarContent
                        onNavigate={() => setOpen(false)}
                        counts={counts}
                    />
                </aside>
            </div>
        </>
    );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    ClipboardCheck,
    FileText,
    Headphones,
    Home,
    Users,
    Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS: {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: number;
}[] = [
    { href: "/partner", label: "홈", icon: Home },
    { href: "/partner/requests", label: "서비스 요청", icon: Users, badge: 3 },
    {
        href: "/partner/management",
        label: "진행 관리",
        icon: ClipboardCheck,
        badge: 1,
    },
    {
        href: "/partner/reports",
        label: "리포트 작성",
        icon: FileText,
        badge: 1,
    },
    { href: "/partner/settlement", label: "정산 관리", icon: Wallet },
];

export function PartnerSidebar() {
    const pathname = usePathname();

    return (
        <aside className="border-border bg-background fixed top-16 bottom-0 left-0 z-30 hidden w-56 flex-col overflow-y-auto border-r px-4 py-6 md:flex">
            <nav className="flex flex-col gap-1">
                {ITEMS.map(({ href, label, icon: Icon, badge }) => {
                    const active = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
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

            {/* 파트너 고객센터 — 사이드바(화면) 하단 고정 */}
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
        </aside>
    );
}

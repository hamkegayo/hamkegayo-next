"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    CalendarDays,
    CircleDollarSign,
    HelpCircle,
    LogOut,
    UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/modal";
import { logout } from "@/app/(user)/_actions/auth";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/mypage", label: "예약 현황", icon: CalendarDays },
    { href: "/mypage/profile", label: "회원 정보", icon: UserRound },
    { href: "/mypage/points", label: "내 포인트", icon: CircleDollarSign },
    { href: "/mypage/support", label: "고객센터", icon: HelpCircle },
];

export function MypageSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [confirmOpen, setConfirmOpen] = useState(false);

    const onLogout = async () => {
        await logout();
        router.push("/login");
        router.refresh();
    };

    return (
        <aside>
            <h2 className="text-foreground mb-6 text-xl font-extrabold">
                마이페이지
            </h2>
            <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
                {ITEMS.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex shrink-0 items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
                                active
                                    ? "bg-brand/10 text-brand"
                                    : "text-foreground hover:bg-muted",
                            )}
                        >
                            <Icon className="size-4" />
                            {label}
                        </Link>
                    );
                })}
            </nav>
            <div className="bg-border my-4 hidden h-px md:block" />
            <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="text-foreground hover:bg-muted hidden w-full items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-semibold transition-colors md:flex"
            >
                <LogOut className="size-4" />
                로그아웃
            </button>

            {/* 로그아웃 확인 모달 */}
            <ConfirmModal
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={onLogout}
                title="로그아웃"
                description="로그아웃 하시겠어요?"
                cancelLabel="취소"
                confirmLabel="로그아웃"
            />
        </aside>
    );
}

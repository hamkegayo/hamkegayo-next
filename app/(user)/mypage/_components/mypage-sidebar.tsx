"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Bell,
    CalendarDays,
    CircleDollarSign,
    HelpCircle,
    LogOut,
    Ticket,
    UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/modal";
import { useLogout } from "@/hooks/use-logout";
import type { OpeningCouponState } from "@/lib/opening-coupon";
import { useCouponStatus } from "@/lib/opening-coupon-offer";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/mypage", label: "예약 현황", icon: CalendarDays },
    { href: "/mypage/notifications", label: "알림", icon: Bell },
    { href: "/mypage/profile", label: "회원 정보", icon: UserRound },
    { href: "/mypage/points", label: "내 포인트", icon: CircleDollarSign },
    { href: "/mypage/coupons", label: "쿠폰함", icon: Ticket },
    { href: "/mypage/support", label: "고객센터", icon: HelpCircle },
];

/** 쿠폰함 메뉴 배지 — 사용 가능(AVAILABLE)일 때만 1 을 보인다 (#282). */
export function CouponMenuBadge({ state }: { state: OpeningCouponState }) {
    if (state !== "AVAILABLE") return null;
    return (
        <span
            aria-label="사용 가능한 쿠폰 1개"
            className="bg-brand text-brand-foreground ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold"
        >
            1
        </span>
    );
}

export function MypageSidebar() {
    const couponStatus = useCouponStatus();
    const pathname = usePathname();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const { logout: onLogout, pending } = useLogout();

    return (
        <aside className="min-w-0">
            <h2 className="text-foreground mb-4 text-xl font-extrabold md:mb-6">
                마이페이지
            </h2>
            <nav className="flex flex-wrap gap-1.5 md:flex-col md:gap-1">
                {ITEMS.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors md:flex md:w-full md:gap-2.5 md:px-4 md:py-3",
                                active
                                    ? "bg-brand/10 text-brand"
                                    : "text-foreground hover:bg-muted",
                            )}
                        >
                            <Icon className="size-4 shrink-0" />
                            {label}
                            {href === "/mypage/coupons" && (
                                <CouponMenuBadge state={couponStatus.state} />
                            )}
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
                confirmDisabled={pending}
            />
        </aside>
    );
}

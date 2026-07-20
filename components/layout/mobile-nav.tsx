"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { LogOut, Menu as MenuIcon, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { logout } from "@/app/(user)/_actions/auth";
import type { HeaderMember } from "@/components/layout/user-header";

type NavItem = { label: string; href: string };

/** 모바일 전용 햄버거 메뉴 (우측 슬라이드 드로어) */
export function MobileNav({
    member,
    navItems,
    className,
}: {
    member: HeaderMember;
    navItems: NavItem[];
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const onLogout = async () => {
        await logout();
        setOpen(false);
        router.push("/login");
        router.refresh();
    };

    const notReady = () => toast.info("준비 중인 기능입니다.");

    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
                aria-label="메뉴 열기"
                className={cn(
                    "border-border text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-lg border transition-colors",
                    className,
                )}
            >
                <MenuIcon className="size-5" />
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
                <Dialog.Popup className="bg-background fixed inset-y-0 right-0 z-50 flex w-72 max-w-[80%] flex-col p-6 shadow-lg transition-transform outline-none data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
                    <div className="mb-4 flex items-center justify-between">
                        <Dialog.Title className="text-foreground text-lg font-bold">
                            메뉴
                        </Dialog.Title>
                        <Dialog.Close
                            aria-label="메뉴 닫기"
                            className="text-muted-foreground hover:bg-muted inline-flex size-8 items-center justify-center rounded-lg transition-colors"
                        >
                            <X className="size-5" />
                        </Dialog.Close>
                    </div>

                    {/* 예약하기 — 핵심 CTA, 최상단 강조 배치 */}
                    <Link
                        href="/reservation"
                        onClick={() => setOpen(false)}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 mb-4 rounded-xl px-4 py-3 text-center text-base font-bold shadow-sm transition-colors"
                    >
                        예약하기
                    </Link>

                    {/* 계정 정보 (로그인 시) */}
                    {member && (
                        <div className="bg-muted/50 mb-2 rounded-lg px-3 py-2.5">
                            <p className="text-foreground font-bold">
                                {member.name} 님
                            </p>
                            <p className="text-muted-foreground truncate text-sm">
                                {member.subText}
                            </p>
                        </div>
                    )}

                    {/* 네비게이션 */}
                    <nav className="flex flex-col">
                        {navItems.map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className="text-foreground hover:bg-muted rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="bg-border my-3 h-px" />

                    {/* 인증 영역 */}
                    {member ? (
                        <div className="flex flex-col">
                            <button
                                type="button"
                                onClick={notReady}
                                className="text-foreground hover:bg-muted flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors"
                            >
                                <UserRound className="size-4" />
                                마이페이지
                            </button>
                            <button
                                type="button"
                                onClick={onLogout}
                                className="text-destructive hover:bg-destructive/10 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                            >
                                <LogOut className="size-4" />
                                로그아웃
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <Link
                                href="/login"
                                onClick={() => setOpen(false)}
                                className="border-border text-foreground hover:bg-muted rounded-full border px-4 py-2 text-center text-sm font-semibold transition-colors"
                            >
                                로그인
                            </Link>
                            <Link
                                href="/signup"
                                onClick={() => setOpen(false)}
                                className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-full px-4 py-2 text-center text-sm font-semibold transition-colors"
                            >
                                회원가입
                            </Link>
                        </div>
                    )}
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

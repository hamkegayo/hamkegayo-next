"use client";

import Image from "next/image";
import Link from "next/link";
import { ZoomIn } from "lucide-react";

import { cn } from "@/lib/utils";
import { useZoom } from "@/components/providers/zoom-provider";
import { MemberMenu } from "@/components/layout/member-menu";
import { MobileNav } from "@/components/layout/mobile-nav";

// 상단 네비게이션 항목 (라우트는 추후 개발 예정)
const NAV_ITEMS = [
    { label: "메인", href: "#" },
    { label: "서비스 소개", href: "#" },
    { label: "이용 후기", href: "#" },
    { label: "QnA", href: "#" },
];

/** 로그인 회원 정보 (비로그인 시 null) */
export type HeaderMember = { name: string; subText: string } | null;

export function UserHeader({ member }: { member: HeaderMember }) {
    const { enlarged, toggle } = useZoom();

    return (
        <header className="border-border bg-background sticky top-0 z-40 w-full border-b">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
                {/* 로고 + 크게보기 */}
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center gap-2">
                        <Image
                            src="/common/logo.svg"
                            alt="함께가요"
                            width={30}
                            height={30}
                            priority
                        />
                        <span className="text-foreground text-xl font-extrabold">
                            함께가요
                        </span>
                    </Link>

                    <button
                        type="button"
                        onClick={toggle}
                        aria-pressed={enlarged}
                        className={cn(
                            "border-brand inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                            enlarged
                                ? "bg-brand text-brand-foreground hover:bg-brand/90"
                                : "bg-background text-brand hover:bg-brand/5",
                        )}
                    >
                        <ZoomIn className="size-4" />
                        {enlarged ? "작게보기" : "크게보기"}
                    </button>
                </div>

                {/* 네비게이션 */}
                <div className="text-foreground flex items-center gap-5 text-sm font-medium">
                    {/* 데스크톱 전용 네비 링크 */}
                    <nav className="hidden items-center gap-5 md:flex">
                        {NAV_ITEMS.map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                className="hover:text-brand transition-colors"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    {/* 예약하기 — 데스크톱 전용 (모바일은 햄버거 드로어 최상단에 배치) */}
                    <Link
                        href="#"
                        className="bg-brand text-brand-foreground hover:bg-brand/90 hidden rounded-full px-4 py-1.5 font-semibold transition-colors md:inline-flex"
                    >
                        예약하기
                    </Link>

                    {/* 데스크톱 전용 인증 영역 */}
                    <div className="hidden items-center gap-5 md:flex">
                        {member ? (
                            <MemberMenu
                                name={member.name}
                                subText={member.subText}
                            />
                        ) : (
                            <>
                                <Link
                                    href="/login"
                                    className="hover:text-brand transition-colors"
                                >
                                    로그인
                                </Link>
                                <span className="text-border">|</span>
                                <Link
                                    href="/signup"
                                    className="hover:text-brand transition-colors"
                                >
                                    회원가입
                                </Link>
                            </>
                        )}
                    </div>

                    {/* 모바일 전용 햄버거 메뉴 */}
                    <MobileNav
                        member={member}
                        navItems={NAV_ITEMS}
                        className="md:hidden"
                    />
                </div>
            </div>
        </header>
    );
}

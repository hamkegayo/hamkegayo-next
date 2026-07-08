"use client";

import Image from "next/image";
import Link from "next/link";
import { ZoomIn } from "lucide-react";

import { cn } from "@/lib/utils";
import { useZoom } from "@/components/providers/zoom-provider";

// 상단 네비게이션 항목 (라우트는 추후 개발 예정)
const NAV_ITEMS = [
  { label: "메인", href: "#" },
  { label: "서비스 소개", href: "#" },
  { label: "이용 후기", href: "#" },
  { label: "QnA", href: "#" },
];

export function UserHeader() {
  const { enlarged, toggle } = useZoom();

  return (
    <header className="w-full border-b border-border bg-background">
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
            <span className="text-xl font-extrabold text-foreground">
              함께가요
            </span>
          </Link>

          <button
            type="button"
            onClick={toggle}
            aria-pressed={enlarged}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-brand px-3 py-1.5 text-sm font-semibold transition-colors",
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
        <nav className="flex items-center gap-5 text-sm font-medium text-foreground">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="hidden transition-colors hover:text-brand md:inline"
            >
              {item.label}
            </Link>
          ))}

          <Link
            href="#"
            className="rounded-full bg-brand px-4 py-1.5 font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
          >
            예약하기
          </Link>

          <Link
            href="/login"
            className="transition-colors hover:text-brand"
          >
            로그인
          </Link>
          <span className="text-border">|</span>
          <Link
            href="#"
            className={cn("transition-colors hover:text-brand")}
          >
            회원가입
          </Link>
        </nav>
      </div>
    </header>
  );
}

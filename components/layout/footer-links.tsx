"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { CookieSettingsButton } from "@/components/analytics/cookie-settings-button";

/**
 * 푸터 링크 줄.
 *
 *  **강조는 현재 보고 있는 페이지에만** 준다. 링크 하나만 항상 다르게
 *  보이면 의미가 아니라 실수로 읽힌다.
 *
 *  개인정보보호법 제30조 ② 는 방침을 "정보주체가 쉽게 확인할 수 있도록"
 *  공개하라고 정하고, 표준지침은 글자 크기·색상으로 다른 고지사항과
 *  구분하기를 **권고**한다. 강행규정은 아니다 — 링크가 푸터에 상시
 *  노출되고 이름이 그대로 "개인정보처리방침" 이면 공개 의무는 충족한다.
 *  (2026-09-05 기획 판단. PG 심사에서 지적되면 되돌린다)
 */
const LINKS = [
    { href: "/faq", label: "FAQ" },
    { href: "/terms", label: "이용약관" },
    { href: "/privacy", label: "개인정보처리방침" },
];

export function FooterLinks() {
    const pathname = usePathname();

    return (
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS.map((l) => {
                const active = pathname === l.href;
                return (
                    <Link
                        key={l.href}
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "underline-offset-4 hover:underline",
                            active
                                ? "text-foreground font-semibold"
                                : "hover:text-foreground",
                        )}
                    >
                        {l.label}
                    </Link>
                );
            })}
            <CookieSettingsButton />
        </nav>
    );
}

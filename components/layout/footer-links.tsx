"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { CookieSettingsButton } from "@/components/analytics/cookie-settings-button";

/**
 * 푸터 링크 줄.
 *
 *  강조가 두 가지 겹친다. 하나로 처리하면 서로를 가린다.
 *
 *   · **현재 보고 있는 페이지** → 굵기로 표시한다(+ aria-current).
 *   · **개인정보처리방침**       → 색으로 표시한다.
 *     개인정보보호법 제30조 ② 는 방침을 "정보주체가 쉽게 확인할 수 있도록"
 *     공개하라고 정한다.
 *
 *  둘 다 굵기로 처리하면 FAQ 를 보고 있어도 방침이 굵게 보여
 *  "지금 방침 페이지에 있나?" 로 읽힌다.
 */
const LINKS = [
    { href: "/faq", label: "FAQ" },
    { href: "/terms", label: "이용약관" },
    // 법이 요구하는 강조 대상
    { href: "/privacy", label: "개인정보처리방침", emphasized: true },
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
                            active && "font-semibold",
                            active || l.emphasized
                                ? "text-foreground"
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

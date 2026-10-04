"use client";

import { useMemo, useState } from "react";
import {
    ChevronDown,
    ClipboardCheck,
    CreditCard,
    Search,
    ShieldCheck,
    UserRound,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Section } from "@/app/(user)/_components/home/section";

import Link from "next/link";
import { FAQ_ITEMS, matchesFaq, type FaqItem } from "@/lib/content/faq";
import { FaqAnswer } from "@/components/content/faq-answer";

type Category = { icon: LucideIcon; name: string; items: FaqItem[] };
const CATEGORIES: Category[] = [
    { name: "서비스 이용", icon: UserRound },
    { name: "서비스 종류", icon: ClipboardCheck },
    { name: "파트너", icon: Users },
    { name: "예약 · 결제", icon: CreditCard },
    { name: "안전 · 보호자", icon: ShieldCheck },
].map((category) => ({
    ...category,
    items: FAQ_ITEMS.filter((item) => item.category === category.name),
}));

/** 카테고리별 아이콘 색상 (시안 반영) */
const CAT_TONE: Record<string, string> = {
    "서비스 이용": "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
    "서비스 종류": "bg-teal-100 text-teal-600 dark:bg-teal-500/15",
    파트너: "bg-violet-100 text-violet-600 dark:bg-violet-500/15",
    "예약 · 결제": "bg-blue-100 text-blue-600 dark:bg-blue-500/15",
    "안전 · 보호자": "bg-sky-100 text-sky-600 dark:bg-sky-500/15",
};

export function FaqList() {
    const [query, setQuery] = useState("");
    const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

    const q = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!q) return CATEGORIES;
        return CATEGORIES.map((c) => ({
            ...c,
            items: c.items.filter((it) => matchesFaq(it, q)),
        })).filter((c) => c.items.length > 0);
    }, [q]);

    const toggle = (key: string) =>
        setOpenKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <Section className="pt-6 md:pt-8">
            {/* 검색 */}
            <div className="mx-auto mb-10 max-w-xl">
                <div className="relative">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="궁금한 내용을 검색해 보세요."
                        aria-label="FAQ 검색"
                        className="border-border bg-background text-foreground focus:border-brand w-full rounded-full border py-3 pr-4 pl-11 text-sm transition-colors outline-none"
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center">
                    검색 결과가 없습니다.
                </p>
            ) : (
                <div className="flex flex-col gap-8">
                    {filtered.map((cat) => {
                        const Icon = cat.icon;
                        return (
                            <div
                                key={cat.name}
                                className="grid gap-4 md:grid-cols-[200px_1fr]"
                            >
                                <div className="flex flex-col items-start gap-3 md:pt-1">
                                    <div
                                        className={cn(
                                            "flex size-14 items-center justify-center rounded-2xl",
                                            CAT_TONE[cat.name] ??
                                                "bg-brand/10 text-brand",
                                        )}
                                    >
                                        <Icon className="size-6" />
                                    </div>
                                    <h2 className="text-foreground text-xl font-extrabold">
                                        {cat.name}
                                    </h2>
                                </div>

                                <div className="divide-border/60 border-border/70 bg-background divide-y overflow-hidden rounded-2xl border shadow-sm">
                                    {cat.items.map((it) => {
                                        const key = it.id;
                                        const isOpen = openKeys.has(key);
                                        return (
                                            <div key={it.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggle(key)}
                                                    aria-expanded={isOpen}
                                                    aria-controls={`${it.id}-answer`}
                                                    className="hover:bg-muted/30 flex w-full items-center justify-between gap-3 px-6 py-5 text-left transition-colors"
                                                >
                                                    <span className="text-foreground text-base font-semibold">
                                                        <span className="text-brand mr-1.5 font-bold">
                                                            Q.
                                                        </span>
                                                        {it.q}
                                                    </span>
                                                    <ChevronDown
                                                        className={cn(
                                                            "text-muted-foreground/60 size-5 shrink-0 transition-transform",
                                                            isOpen &&
                                                                "text-brand rotate-180",
                                                        )}
                                                    />
                                                </button>
                                                {/* grid-rows 0fr→1fr 트릭으로 높이 부드럽게 전환 */}
                                                <div
                                                    id={`${it.id}-answer`}
                                                    hidden={!isOpen}
                                                    className={cn(
                                                        "grid transition-[grid-template-rows] duration-200 ease-out",
                                                        isOpen
                                                            ? "grid-rows-[1fr]"
                                                            : "grid-rows-[0fr]",
                                                    )}
                                                >
                                                    <div className="overflow-hidden">
                                                        <div className="px-6 pb-5">
                                                            <FaqAnswer
                                                                item={it}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            <p className="text-muted-foreground mt-8 text-sm">
                자세한 기준은{" "}
                <Link className="text-brand underline" href="/terms">
                    이용약관
                </Link>
                과{" "}
                <Link className="text-brand underline" href="/privacy">
                    개인정보처리방침
                </Link>
                을 확인해 주세요.
            </p>
        </Section>
    );
}

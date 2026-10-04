"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Section } from "@/app/(user)/_components/home/section";
import { COMPANY } from "@/lib/legal/company";
import { ContactLink } from "@/app/(user)/_components/home/contact-link";

import { SERVICE_FAQS } from "@/lib/content/faq";
import { FaqAnswer } from "@/components/content/faq-answer";

function FaqAccordion() {
    // -1 = 전부 접힘(기본). 한 번에 하나만 열린다.
    const [open, setOpen] = useState(-1);

    return (
        <div className="bg-panel-muted rounded-3xl p-6 md:p-8">
            <h2 className="text-foreground text-2xl font-extrabold md:text-3xl">
                궁금한 점이 있으신가요?
            </h2>
            <p className="text-description-foreground mt-2 text-sm">
                자주 묻는 질문을 통해 확인하세요.
            </p>

            <div className="mt-6 flex flex-col gap-2">
                {SERVICE_FAQS.map((faq, i) => {
                    const isOpen = open === i;
                    return (
                        <div
                            key={faq.id}
                            className={cn(
                                "bg-background rounded-xl border transition-colors",
                                isOpen ? "border-brand" : "border-border",
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => setOpen(isOpen ? -1 : i)}
                                aria-expanded={isOpen}
                                aria-controls={`service-${faq.id}-answer`}
                                className="text-foreground flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold"
                            >
                                {faq.q}
                                <ChevronDown
                                    className={cn(
                                        "text-muted-foreground size-4 shrink-0 transition-transform",
                                        isOpen && "text-brand rotate-180",
                                    )}
                                />
                            </button>
                            {/* grid-rows 0fr→1fr 트릭으로 높이를 부드럽게 전환 */}
                            <div
                                id={`service-${faq.id}-answer`}
                                hidden={!isOpen}
                                className={cn(
                                    "grid transition-[grid-template-rows] duration-200 ease-out",
                                    isOpen
                                        ? "grid-rows-[1fr]"
                                        : "grid-rows-[0fr]",
                                )}
                            >
                                <div className="overflow-hidden">
                                    <div className="px-4 pb-4">
                                        <FaqAnswer item={faq} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6">
                <Link
                    href="/faq"
                    className="bg-brand/10 text-brand hover:bg-brand/15 inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-bold transition-colors"
                >
                    전체 FAQ 보기
                </Link>
            </div>
        </div>
    );
}

function BookingCta() {
    return (
        <div className="bg-panel-muted flex flex-col items-center justify-center rounded-3xl px-6 py-12 text-center">
            <h2 className="text-foreground text-2xl font-extrabold md:text-3xl">
                지금 간편하게 예약하세요.
            </h2>
            <p className="text-description-foreground mt-3">
                서비스 제공시간은 매일 07:00~19:00이며 주말·공휴일을 포함합니다.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                    href="/reservation"
                    className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                >
                    동행 예약하기
                </Link>
                <ContactLink
                    href={`tel:${COMPANY.tel}`}
                    method="phone"
                    className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                >
                    전화 상담 받기
                </ContactLink>
            </div>
        </div>
    );
}

/** FAQ 아코디언 + 예약 CTA (하단 2단 구성) */
export function ServiceFaq() {
    return (
        <Section>
            <div className="grid items-stretch gap-4 md:grid-cols-2">
                <FaqAccordion />
                <BookingCta />
            </div>
        </Section>
    );
}

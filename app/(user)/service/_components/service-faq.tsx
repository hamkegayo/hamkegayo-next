"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Section } from "@/app/(user)/_components/home/section";
import { ComingSoonButton } from "@/app/(user)/_components/home/coming-soon-button";

const FAQS: { q: string; a: string }[] = [
    {
        q: "당일 예약도 가능한가요?",
        a: "네, 가능합니다. 파트너 일정에 따라 당일 예약도 접수되며, 긴급 요청은 24시간 언제든 신청하실 수 있습니다. 다만 시간대에 따라 배정이 어려울 수 있어 가급적 미리 예약해 주시면 좋습니다.",
    },
    {
        q: "파트너는 어떤 분들인가요?",
        a: "간호조무사·요양보호사 등 관련 자격을 갖춘 분들로 구성되며, 신원 확인과 교육을 거쳐 활동합니다. 경력과 후기를 확인하고 직접 선택하실 수 있습니다.",
    },
    {
        q: "취소 및 환불 규정이 어떻게 되나요?",
        a: "예약 시작 시간 기준 일정 시간 전까지는 전액 환불되며, 이후에는 진행 상황에 따라 일부 수수료가 발생할 수 있습니다. 자세한 규정은 이용약관을 참고해 주세요.",
    },
    {
        q: "추가 요금은 언제 발생하나요?",
        a: "기본 이용 시간을 초과하는 경우 30분 단위로 추가 요금이 발생합니다. 픽업·귀가 등 이동이 포함된 플러스 이용 시 요금 기준이 달라질 수 있습니다.",
    },
];

function FaqAccordion() {
    // -1 = 전부 접힘(기본). 한 번에 하나만 열린다.
    const [open, setOpen] = useState(-1);

    return (
        <div className="bg-muted/50 rounded-3xl p-6 md:p-8">
            <h2 className="text-foreground text-2xl font-extrabold md:text-3xl">
                궁금한 점이 있으신가요?
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
                자주 묻는 질문을 통해 확인하세요.
            </p>

            <div className="mt-6 flex flex-col gap-2">
                {FAQS.map((faq, i) => {
                    const isOpen = open === i;
                    return (
                        <div
                            key={faq.q}
                            className={cn(
                                "bg-background rounded-xl border transition-colors",
                                isOpen ? "border-brand" : "border-border",
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => setOpen(isOpen ? -1 : i)}
                                aria-expanded={isOpen}
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
                                className={cn(
                                    "grid transition-[grid-template-rows] duration-200 ease-out",
                                    isOpen
                                        ? "grid-rows-[1fr]"
                                        : "grid-rows-[0fr]",
                                )}
                            >
                                <div className="overflow-hidden">
                                    <p
                                        className={cn(
                                            "text-muted-foreground px-4 pb-4 text-sm leading-relaxed transition-opacity duration-200",
                                            isOpen
                                                ? "opacity-100"
                                                : "opacity-0",
                                        )}
                                    >
                                        {faq.a}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6">
                <ComingSoonButton className="text-brand hover:text-brand/80 text-sm font-bold transition-colors">
                    전체 FAQ 보기
                </ComingSoonButton>
            </div>
        </div>
    );
}

function BookingCta() {
    return (
        <div className="bg-muted/30 flex flex-col items-center justify-center rounded-3xl px-6 py-12 text-center">
            <h2 className="text-foreground text-2xl font-extrabold md:text-3xl">
                지금 간편하게 예약하세요.
            </h2>
            <p className="text-muted-foreground mt-3">
                언제든 24시간, 필요한 순간에 함께가요가 곁에 있습니다.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ComingSoonButton className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors">
                    동행 예약하기
                </ComingSoonButton>
                <ComingSoonButton className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors">
                    전화 상담 받기
                </ComingSoonButton>
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

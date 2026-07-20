"use client";

import { Calendar, Check, Clock, House, Plus, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore, type Plan } from "../_store/reservation-store";
import { StepBand, StepNav } from "./step-band";

type PlanCard = {
    value: Exclude<Plan, "">;
    name: string;
    icon: LucideIcon;
    features: string[];
    price: string;
    priceNote: string;
};

const PLANS: PlanCard[] = [
    {
        value: "basic",
        name: "베이직 서비스",
        icon: Plus,
        features: [
            "병원에서 파트너와 만남",
            "접수 및 수납 지원",
            "진료 및 검사 동행",
            "약국 동행 (선택)",
        ],
        price: "이용금액 20,000원",
        priceNote: "(30분 추가 시 10,000원)",
    },
    {
        value: "plus",
        name: "플러스 서비스",
        icon: House,
        features: [
            "자택에서 파트너와 만남",
            "병원 이동 지원",
            "접수 및 수납 지원",
            "진료 및 검사 동행",
            "귀가 동행 지원",
        ],
        price: "이용금액 25,000원",
        priceNote: "(30분 추가 시 12,500원)",
    },
];

const NOTICES: { icon: LucideIcon; lines: string[] }[] = [
    {
        icon: Truck,
        lines: [
            "대중교통 이용시, 교통비는 각자 부담합니다.",
            "택시 이동시, 택시비는 고객님이 부담합니다.",
        ],
    },
    {
        icon: Calendar,
        lines: ["예약제로 운영되어 조기 종료시 환불이 불가합니다."],
    },
    {
        icon: Clock,
        lines: [
            "주말, 공휴일 30% 할증이 붙습니다.",
            "심야 (22시 ~ 07시) 50% 할증이 붙습니다.",
        ],
    },
];

export function StepServiceSelect() {
    const { data, patch, next, prev } = useReservationStore();
    const selected = data.plan;

    const onNext = () => {
        if (!selected) {
            toast.info("원하는 서비스를 선택해 주세요.");
            return;
        }
        next();
    };

    return (
        <>
            <StepBand
                index={3}
                title="원하는 서비스를 선택해주세요."
                subtitles={[
                    "어떤 도움이 필요하신가요?",
                    "병원에서 만나는 동행부터 자택 픽업이 포함된 동행까지 선택할 수 있습니다.",
                ]}
            />

            <Section>
                <div className="mx-auto max-w-3xl space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        {PLANS.map((plan) => {
                            const Icon = plan.icon;
                            const active = selected === plan.value;
                            return (
                                <div
                                    key={plan.value}
                                    className={cn(
                                        "bg-background flex flex-col rounded-2xl border-2 p-6 transition-colors md:p-8",
                                        active
                                            ? "border-brand shadow-sm"
                                            : "bg-muted/30 border-transparent",
                                    )}
                                >
                                    <div className="text-brand flex items-center justify-center gap-2">
                                        <Icon className="size-6" />
                                        <h3 className="text-foreground text-xl font-extrabold">
                                            {plan.name}
                                        </h3>
                                    </div>
                                    <div className="border-brand/30 mt-4 border-b" />

                                    <ul className="mt-6 flex flex-col gap-3">
                                        {plan.features.map((f) => (
                                            <li
                                                key={f}
                                                className="text-foreground flex items-center gap-2 text-sm"
                                            >
                                                <Check
                                                    className="text-brand size-4 shrink-0"
                                                    strokeWidth={3}
                                                />
                                                {f}
                                            </li>
                                        ))}
                                    </ul>

                                    <div className="mt-8 text-center">
                                        <p className="text-foreground text-lg font-extrabold">
                                            {plan.price}
                                        </p>
                                        <p className="text-muted-foreground mt-1 text-sm font-semibold">
                                            {plan.priceNote}
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            patch({ plan: plan.value })
                                        }
                                        aria-pressed={active}
                                        className={cn(
                                            "mt-5 w-full rounded-lg px-4 py-3 text-sm font-bold transition-colors",
                                            active
                                                ? "bg-brand text-brand-foreground hover:bg-brand/90"
                                                : "border-border bg-background text-foreground hover:bg-muted border",
                                        )}
                                    >
                                        선택
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* 서비스 이용 안내 */}
                    <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                        <div className="flex items-center gap-2">
                            <span className="border-muted-foreground text-muted-foreground flex size-5 items-center justify-center rounded-full border text-[11px] font-bold">
                                i
                            </span>
                            <h3 className="text-foreground font-bold">
                                서비스 이용 안내
                            </h3>
                        </div>
                        <div className="sm:divide-border mt-5 grid gap-6 sm:grid-cols-3 sm:divide-x">
                            {NOTICES.map(({ icon: Icon, lines }, i) => (
                                <div
                                    key={i}
                                    className="flex gap-3 sm:px-4 sm:first:pl-0"
                                >
                                    <Icon className="text-muted-foreground size-6 shrink-0" />
                                    <div className="flex flex-col gap-2">
                                        {lines.map((line) => (
                                            <p
                                                key={line}
                                                className="text-muted-foreground text-sm leading-relaxed"
                                            >
                                                {line}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <StepNav onPrev={prev} nextType="button" onNext={onNext} />
                </div>
            </Section>
        </>
    );
}

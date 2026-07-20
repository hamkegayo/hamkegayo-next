import {
    ChevronRight,
    ClipboardPlus,
    FileText,
    House,
    Pill,
    Stethoscope,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Section } from "@/app/(user)/_components/home/section";
import { ComingSoonButton } from "@/app/(user)/_components/home/coming-soon-button";

type Step = { icon: LucideIcon; label: string };

type Plan = {
    name: string;
    scope: string;
    desc: string;
    steps: Step[];
    price: string;
    priceNote: string;
    cta: string;
};

const PLANS: Plan[] = [
    {
        name: "베이직",
        scope: "병원 내 동행",
        desc: "병원에서 파트너를 만나 접수, 진료, 수납, 약 수령까지 함께 진행합니다. 병원 이동은 직접 가능하지만 진료 과정에 도움이 필요한 분께 추천합니다.",
        steps: [
            { icon: FileText, label: "접수 지원" },
            { icon: Stethoscope, label: "진료 동행" },
            { icon: Pill, label: "약국 동행" },
            { icon: ClipboardPlus, label: "진료리포트" },
        ],
        price: "1시간당 20,000원",
        priceNote: "(30분 추가 시 10,000원)",
        cta: "Basic으로 예약하기",
    },
    {
        name: "플러스",
        scope: "픽업 포함 동행",
        desc: "자택에서 파트너를 만나 병원 이동, 접수, 진료, 수납, 약 수령, 귀가까지 함께합니다. 보호자가 동행하기 어렵거나 이동이 불편한 분께 추천합니다.",
        steps: [
            { icon: House, label: "픽업 지원" },
            { icon: FileText, label: "접수 지원" },
            { icon: Stethoscope, label: "진료 동행" },
            { icon: Pill, label: "약국 동행" },
            { icon: ClipboardPlus, label: "진료리포트" },
            { icon: House, label: "귀가 지원" },
        ],
        price: "1시간당 25,000원",
        priceNote: "(30분 추가 시 12,500원)",
        cta: "Plus로 예약하기",
    },
];

/** 아이콘 스텝 흐름 — 좁은 화면에서는 자동 줄바꿈 */
function StepFlow({ steps }: { steps: Step[] }) {
    return (
        <div className="mt-6 flex flex-wrap items-start justify-center gap-x-1 gap-y-4">
            {steps.map(({ icon: Icon, label }, i) => (
                <div key={label} className="flex items-start">
                    <div className="flex w-16 flex-col items-center gap-1.5">
                        <div className="bg-brand/10 text-brand flex size-11 items-center justify-center rounded-xl">
                            <Icon className="size-5" />
                        </div>
                        <span className="text-foreground text-center text-xs font-medium">
                            {label}
                        </span>
                    </div>
                    {i < steps.length - 1 && (
                        <ChevronRight className="text-brand/40 mt-3 size-4 shrink-0" />
                    )}
                </div>
            ))}
        </div>
    );
}

function PlanCard({ plan }: { plan: Plan }) {
    return (
        <div className="border-border bg-background flex flex-col rounded-2xl border p-6 md:p-8">
            <h3 className="text-foreground text-center text-xl font-extrabold">
                {plan.name}{" "}
                <span className="text-muted-foreground text-base font-semibold">
                    ({plan.scope})
                </span>
            </h3>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                {plan.desc}
            </p>

            <StepFlow steps={plan.steps} />

            <hr className="border-border my-6" />

            <p className="text-foreground text-center text-sm font-semibold">
                이용 요금
            </p>
            <p className="text-brand mt-1 text-center text-lg font-extrabold">
                {plan.price}{" "}
                <span className="text-muted-foreground text-sm font-medium">
                    {plan.priceNote}
                </span>
            </p>

            <ComingSoonButton className="bg-brand text-brand-foreground hover:bg-brand/90 mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold transition-colors">
                {plan.cta}
            </ComingSoonButton>
        </div>
    );
}

/** 상황별 요금제(베이직 / 플러스) 소개 */
export function ServicePlans() {
    return (
        <Section>
            <div className="bg-muted/50 rounded-3xl p-6 md:p-10">
                <h2 className="text-foreground text-2xl font-extrabold md:text-3xl">
                    상황에 맞는 서비스를 고르세요.
                </h2>
                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {PLANS.map((plan) => (
                        <PlanCard key={plan.name} plan={plan} />
                    ))}
                </div>
            </div>
        </Section>
    );
}

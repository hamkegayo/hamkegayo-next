import {
    CircleCheck,
    CircleX,
    ClipboardX,
    Lock,
    ShieldCheck,
    Umbrella,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Section } from "@/app/(user)/_components/home/section";

type Tone = "emerald" | "rose" | "violet" | "sky";

const TONE: Record<
    Tone,
    { box: string; icon: string; title: string; decor: string }
> = {
    emerald: {
        box: "border-emerald-100 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10",
        icon: "text-emerald-600",
        title: "text-emerald-700 dark:text-emerald-400",
        decor: "text-emerald-500/15",
    },
    rose: {
        box: "border-rose-100 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10",
        icon: "text-rose-600",
        title: "text-rose-700 dark:text-rose-400",
        decor: "text-rose-500/15",
    },
    violet: {
        box: "border-violet-100 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10",
        icon: "text-violet-600",
        title: "text-violet-700 dark:text-violet-400",
        decor: "text-violet-500/15",
    },
    sky: {
        box: "border-sky-100 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10",
        icon: "text-sky-600",
        title: "text-sky-700 dark:text-sky-400",
        decor: "text-sky-500/15",
    },
};

const COLUMNS: {
    icon: LucideIcon;
    decorIcon: LucideIcon;
    tone: Tone;
    title: string;
    items: string[];
}[] = [
    {
        icon: CircleCheck,
        decorIcon: Users,
        tone: "emerald",
        title: "할 수 있는 일",
        items: [
            "병원 이동 동행 및 휠체어 이동 보조",
            "접수, 수납, 검사 동선 안내",
            "진료 내용 메모 및 보호자 전달",
            "병원 이용 과정 지원",
            "일정 및 준비물 확인 지원",
        ],
    },
    {
        icon: CircleX,
        decorIcon: ClipboardX,
        tone: "rose",
        title: "하지 않는 일",
        items: [
            "진단, 치료, 주사, 처치",
            "의료적 판단 및 응급상황 진단",
            "병원 추천 및 특정 의료기관 알선",
            "보험 청구 대행",
            "의료 상담 및 의학적 자문",
        ],
    },
    {
        icon: Lock,
        decorIcon: Lock,
        tone: "violet",
        title: "개인정보 보호",
        items: [
            "서비스 제공에 필요한 최소한의 정보만 수집합니다.",
            "민감정보는 별도 동의를 통해 제공합니다.",
            "모든 정보는 안전하게 암호화하여 관리합니다.",
            "제3자 제공은 원칙적으로 하지 않습니다.",
        ],
    },
    {
        icon: Umbrella,
        decorIcon: Umbrella,
        tone: "sky",
        title: "안전 및 배상",
        items: [
            "사고 발생 시 신속한 대응 체계를 운영합니다.",
            "배상 구조를 사전에 마련하여 제공합니다.",
            "응급 상황 시 즉시 보호자에게 연락합니다.",
        ],
    },
];

/** "서비스 이용 전 꼭 확인해주세요" — 운영 원칙 4칸 안내 */
export function ServicePrinciples() {
    return (
        <Section className="pt-6 md:pt-8">
            <div className="bg-muted/40 rounded-3xl p-6 md:p-8">
                <div className="flex items-start gap-3">
                    <div className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                        <ShieldCheck className="size-5" />
                    </div>
                    <div>
                        <h2 className="text-foreground text-lg font-bold">
                            서비스 이용 전 꼭 확인해주세요
                        </h2>
                        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                            함께가요는 의료행위가 아닌 비의료 지원 서비스입니다.
                            보다 안전하고 신뢰할 수 있는 서비스를 제공하기 위해
                            명확한 운영 원칙을 지키고 있습니다.
                        </p>
                    </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {COLUMNS.map(
                        ({
                            icon: Icon,
                            decorIcon: Decor,
                            tone,
                            title,
                            items,
                        }) => {
                            const t = TONE[tone];
                            return (
                                <div
                                    key={title}
                                    className={cn(
                                        "relative min-h-44 overflow-hidden rounded-2xl border p-5",
                                        t.box,
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon
                                            className={cn(
                                                "size-5 shrink-0",
                                                t.icon,
                                            )}
                                        />
                                        <h3
                                            className={cn("font-bold", t.title)}
                                        >
                                            {title}
                                        </h3>
                                    </div>
                                    <ul className="relative z-10 mt-4 flex flex-col gap-2">
                                        {items.map((item) => (
                                            <li
                                                key={item}
                                                className="text-muted-foreground text-sm leading-relaxed"
                                            >
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                    {/* 하단 흐린 장식 아이콘 */}
                                    <Decor
                                        aria-hidden
                                        className={cn(
                                            "pointer-events-none absolute -right-1 -bottom-2 size-16",
                                            t.decor,
                                        )}
                                    />
                                </div>
                            );
                        },
                    )}
                </div>
            </div>
        </Section>
    );
}

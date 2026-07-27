import {
    Award,
    Calendar,
    ClipboardList,
    CreditCard,
    IdCard,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import Link from "next/link";

import { Section } from "./section";

const STEPS: { icon: LucideIcon; title: string; desc: string }[] = [
    {
        icon: Calendar,
        title: "예약 신청",
        desc: "원하는 날짜와 시간을 정해주세요.",
    },
    {
        icon: IdCard,
        title: "파트너 선택",
        desc: "이력과 리뷰를 보고 동행할 파트너를 선택해주세요.",
    },
    {
        icon: Users,
        title: "병원 동행",
        desc: "파트너와 함께 걱정없이 병원에 다녀오세요.",
    },
    {
        icon: ClipboardList,
        title: "리포트 확인",
        desc: "진료 내용과 특이사항이 포함된 리포트를 확인하세요.",
    },
    {
        icon: CreditCard,
        title: "결제 진행",
        desc: "서비스 종료 후 최종 금액을 결제하세요.",
    },
    {
        icon: Award,
        title: "포인트 적립",
        desc: "서비스 리뷰를 작성하고 3,000 포인트를 받으세요.",
    },
];

export function HowToUse() {
    return (
        <Section>
            <h2 className="text-foreground text-center text-2xl font-extrabold md:text-3xl">
                이용 방법
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {STEPS.map(({ icon: Icon, title, desc }, i) => (
                    <div
                        key={title}
                        className="border-border bg-background relative rounded-2xl border p-6"
                    >
                        <span className="bg-brand text-brand-foreground absolute top-5 left-5 flex size-7 items-center justify-center rounded-full text-sm font-bold">
                            {i + 1}
                        </span>
                        <div className="flex flex-col items-center text-center">
                            <div className="bg-brand/10 text-brand flex size-12 items-center justify-center rounded-xl">
                                <Icon className="size-6" />
                            </div>
                            <h3 className="text-foreground mt-4 font-bold">
                                {title}
                            </h3>
                            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                                {desc}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-8 flex justify-center">
                <Link
                    href="/reservation"
                    className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                >
                    서비스 예약하기
                </Link>
            </div>
        </Section>
    );
}

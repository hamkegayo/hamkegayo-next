import {
    Calendar,
    ClipboardList,
    CreditCard,
    IdCard,
    Receipt,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import Link from "next/link";

import { Section } from "./section";

// 약관 제9조 ③~⑤(수락 파트너 중 1명 선택 → 30분 안에 선결제 → 확정),
// 제21조 ③~⑤(종료 후 실제 이용요금 산정 → 차액 추가결제 또는 환불) 순서를 따른다.
const STEPS: { icon: LucideIcon; title: string; desc: string }[] = [
    {
        icon: Calendar,
        title: "예약 신청",
        desc: "병원과 원하는 날짜·시간을 입력해 예약을 신청하세요.",
    },
    {
        icon: IdCard,
        title: "파트너 선택",
        desc: "예약을 수락한 파트너의 정보를 확인하고 1명을 선택하세요.",
    },
    {
        icon: CreditCard,
        title: "선결제 · 예약 확정",
        desc: "선택 후 30분 안에 예약금액을 결제하면 예약이 확정돼요.",
    },
    {
        icon: Users,
        title: "병원 동행",
        desc: "파트너와 함께 걱정없이 병원에 다녀오세요.",
    },
    {
        icon: Receipt,
        title: "최종 정산",
        desc: "서비스 종료 후 실제 이용시간으로 정산해요. 차액은 추가결제하거나 환불해 드려요.",
    },
    {
        icon: ClipboardList,
        title: "리포트 확인",
        desc: "동행 내용과 특이사항이 포함된 리포트를 확인하세요.",
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
                            <p className="text-description-foreground mt-2 text-sm leading-relaxed break-keep">
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

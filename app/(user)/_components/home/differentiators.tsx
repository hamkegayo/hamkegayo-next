import { BadgeCheck, Bell, CalendarDays } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import Link from "next/link";

import { Section } from "./section";

const ITEMS: { icon: LucideIcon; title: string; desc: string; tag: string }[] =
    [
        {
            icon: CalendarDays,
            title: "주말에도 동행",
            desc: "평일에 시간을 내기 어려우신가요? 주말·공휴일에도 병원 방문을 함께합니다.",
            tag: "주말·공휴일 포함",
        },
        {
            icon: BadgeCheck,
            title: "파트너 직접 선택",
            desc: "수락한 파트너의 평점과 후기를 보고 고를 수 있어요.",
            tag: "원하는 파트너 선택 가능",
        },
        {
            // 여기 있던 "실시간 위치 공유" 는 구현된 적이 없는 기능이었다(#60).
            // 실제로 나가는 알림으로 바꿨다.
            icon: Bell,
            title: "단계마다 알림",
            desc: "파트너 도착부터 완료·리포트까지 예약하신 계정으로 알려드려요.",
            tag: "진행 상황 확인 가능",
        },
    ];

export function Differentiators() {
    return (
        <Section>
            <div className="bg-panel-brand rounded-3xl p-6 md:p-10">
                <h2 className="text-foreground text-center text-2xl font-extrabold md:text-3xl">
                    함께가요의 차별점
                </h2>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    {ITEMS.map(({ icon: Icon, title, desc, tag }) => (
                        <div
                            key={title}
                            className="border-border bg-background rounded-2xl border p-6 text-center"
                        >
                            <div className="bg-brand/10 text-brand mx-auto flex size-12 items-center justify-center rounded-xl">
                                <Icon className="size-6" />
                            </div>
                            <h3 className="text-foreground mt-4 font-bold">
                                {title}
                            </h3>
                            <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                                {desc}
                            </p>
                            <p className="text-brand mt-4 text-sm font-semibold">
                                {tag}
                            </p>
                        </div>
                    ))}
                </div>
                <div className="mt-8 flex justify-center">
                    <Link
                        href="/service"
                        className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-5 py-2.5 text-sm font-bold transition-colors"
                    >
                        서비스 설명 보기
                    </Link>
                </div>
            </div>
        </Section>
    );
}

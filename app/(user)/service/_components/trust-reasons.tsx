import Image from "next/image";
import { BadgeCheck, Bell, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Section } from "@/app/(user)/_components/home/section";

/** 안심 이유 우측 비주얼 이미지 (public/user/service-card-*.png) */
function Visual({
    src,
    alt,
    width,
    height,
}: {
    src: string;
    alt: string;
    width: number;
    height: number;
}) {
    return (
        <div className="w-full max-w-sm overflow-hidden rounded-2xl md:w-80">
            <Image
                src={src}
                alt={alt}
                width={width}
                height={height}
                className="h-auto w-full object-cover"
            />
        </div>
    );
}

/**
 * 진행 알림 미리보기.
 *
 *  전에는 이 자리에 지도 이미지와 "실시간 위치 공유" 가 있었다. 위치 공유는
 *  **구현된 적이 없는 기능**이라 내렸다(#60). 대신 실제로 나가는 알림을
 *  그대로 보여 준다 — 문구가 코드보다 앞서 나가지 않게.
 */
function NotifyPreview() {
    const items = [
        "파트너가 예약을 수락했어요",
        "파트너가 도착했어요",
        "서비스가 완료되었어요",
        "리포트가 도착했어요",
    ];

    return (
        <div className="border-border bg-background w-full max-w-sm space-y-2 rounded-2xl border p-4 md:w-80">
            {items.map((t) => (
                <div key={t} className="flex items-center gap-2.5">
                    <span className="bg-brand/10 text-brand flex size-7 shrink-0 items-center justify-center rounded-full">
                        <Bell className="size-3.5" />
                    </span>
                    <span className="text-foreground text-xs font-semibold">
                        {t}
                    </span>
                </div>
            ))}
        </div>
    );
}

const REASONS: {
    icon: LucideIcon;
    title: string;
    desc: string;
    visual: React.ReactNode;
}[] = [
    {
        icon: Clock,
        title: "24시간 요청 가능합니다.",
        desc: "시간 제약 없이 언제든 요청하고,\n필요한 순간에도 도움을 받을 수 있습니다.",
        visual: (
            <Visual
                src="/user/service-card-landing.png"
                alt="함께가요 앱으로 언제든 요청하는 모습"
                width={360}
                height={150}
            />
        ),
    },
    {
        icon: BadgeCheck,
        title: "원하는 파트너 선택이 가능합니다.",
        desc: "경력과 후기를 확인하고,\n원하는 파트너를 직접 선택할 수 있습니다.",
        visual: (
            <Visual
                src="/user/service-card-partner.png"
                alt="파트너 프로필 카드 예시"
                width={358}
                height={95}
            />
        ),
    },
    {
        icon: Bell,
        title: "진행 상황을 알려드립니다.",
        desc: "파트너 수락부터 도착·완료·리포트까지\n단계마다 보호자에게 알림이 갑니다.",
        visual: <NotifyPreview />,
    },
];

/** "함께가요가 더 안심되는 이유" — 3가지 특징 */
export function TrustReasons() {
    return (
        <Section>
            <div className="bg-brand/5 rounded-3xl p-6 md:p-10">
                <h2 className="text-foreground text-2xl font-extrabold md:text-3xl">
                    함께가요가 더 안심되는 이유
                </h2>
                <div className="mt-8 flex flex-col gap-4">
                    {REASONS.map(({ icon: Icon, title, desc, visual }) => (
                        <div
                            key={title}
                            className="border-border bg-background flex flex-col gap-6 rounded-2xl border p-6 md:flex-row md:items-center md:justify-between md:p-8"
                        >
                            <div className="flex items-start gap-4">
                                <div className="bg-brand/10 text-brand flex size-11 shrink-0 items-center justify-center rounded-xl">
                                    <Icon className="size-5" />
                                </div>
                                <div>
                                    <h3 className="text-foreground text-lg font-bold">
                                        {title}
                                    </h3>
                                    <p className="text-muted-foreground mt-2 leading-relaxed whitespace-pre-line">
                                        {desc}
                                    </p>
                                </div>
                            </div>
                            <div className="shrink-0 md:pl-6">{visual}</div>
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}

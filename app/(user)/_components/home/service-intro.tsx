import { Ambulance, House, Pill, Stethoscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Section } from "./section";

const SERVICES: { icon: LucideIcon; title: string; desc: string }[] = [
    {
        icon: Ambulance,
        title: "병원 이동 동행",
        desc: "병원까지 안전하게 동행해드립니다.",
    },
    {
        icon: Stethoscope,
        title: "원내 동행",
        desc: "접수·수납 및 안내를 도와드립니다.",
    },
    { icon: Pill, title: "약국 동행", desc: "약국 방문까지 함께합니다." },
    {
        icon: House,
        title: "안전 귀가",
        desc: "집까지 안전하게 동행해드립니다.",
    },
];

export function ServiceIntro() {
    return (
        <Section>
            <div className="bg-muted/50 rounded-3xl p-6 md:p-10">
                <h2 className="text-foreground text-center text-2xl font-extrabold md:text-3xl">
                    병원동행 서비스란?
                </h2>
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {SERVICES.map(({ icon: Icon, title, desc }) => (
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
                            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                                {desc}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}

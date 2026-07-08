import { Ambulance, House, Pill, Stethoscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Section } from "./section";

const SERVICES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Ambulance, title: "병원 이동 동행", desc: "병원까지 안전하게 동행해드립니다." },
  { icon: Stethoscope, title: "진료 동행", desc: "진료실 동행 및 의사소통을 도와드립니다." },
  { icon: Pill, title: "약 수령", desc: "처방 약 수령까지 꼼꼼하게 도와드립니다." },
  { icon: House, title: "안전 귀가", desc: "집까지 안전하게 동행해드립니다." },
];

export function ServiceIntro() {
  return (
    <Section>
      <div className="rounded-3xl bg-muted/50 p-6 md:p-10">
        <h2 className="text-center text-2xl font-extrabold text-foreground md:text-3xl">
          병원동행 서비스란?
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-background p-6 text-center"
            >
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon className="size-6" />
              </div>
              <h3 className="mt-4 font-bold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

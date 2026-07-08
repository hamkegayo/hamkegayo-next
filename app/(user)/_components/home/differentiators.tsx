import { BadgeCheck, Clock, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ComingSoonButton } from "./coming-soon-button";
import { Section } from "./section";

const ITEMS: { icon: LucideIcon; title: string; desc: string; tag: string }[] = [
  {
    icon: Clock,
    title: "24시간 요청 가능",
    desc: "갑작스런 상황에도 언제든 요청할 수 있어요.",
    tag: "긴급 요청 접수 가능",
  },
  {
    icon: BadgeCheck,
    title: "파트너 직접 선택",
    desc: "경력, 자격증, 후기까지 모든 정보를 공개해요.",
    tag: "원하는 파트너 선택 가능",
  },
  {
    icon: MapPin,
    title: "실시간 위치 공유",
    desc: "동행 중 실시간 위치 공유로 안심시켜드려요.",
    tag: "진행 상황 확인 가능",
  },
];

export function Differentiators() {
  return (
    <Section>
      <div className="rounded-3xl bg-brand/5 p-6 md:p-10 ">
        <h2 className="text-center text-2xl font-extrabold text-foreground md:text-3xl">
          함께가요의 차별점
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {ITEMS.map(({ icon: Icon, title, desc, tag }) => (
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
              <p className="mt-4 text-sm font-semibold text-brand">{tag}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <ComingSoonButton className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted">
            서비스 설명 보기
          </ComingSoonButton>
        </div>
      </div>
    </Section>
  );
}

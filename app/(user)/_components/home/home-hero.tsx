import Image from "next/image";

import { ComingSoonButton } from "./coming-soon-button";
import { Section } from "./section";

export function HomeHero() {
  return (
    <Section className="md:py-16">
      <div className="grid items-center gap-12 md:grid-cols-[1fr_1.4fr] md:gap-16">
        {/* 텍스트 */}
        <div>
          <span className="inline-block rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
            전문 병원 동행 서비스
          </span>
          <h1 className="mt-5 text-3xl leading-snug font-extrabold text-foreground md:text-4xl md:leading-tight">
            부모님의 병원 방문,
            <br />
            혼자 걱정하지 마세요
            <br />
            <span className="text-brand">함께가요</span>
          </h1>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            병원까지 이동, 병원 접수, 진료, 귀가까지
            <br />
            전문 동행 파트너가 끝까지 함께합니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ComingSoonButton className="rounded-lg bg-brand px-6 py-3 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand/90">
              서비스 예약하기
            </ComingSoonButton>
            <ComingSoonButton className="rounded-lg border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted">
              전화 상담하기
            </ComingSoonButton>
          </div>
        </div>

        {/* 이미지 */}
        <div className="overflow-hidden rounded-3xl">
          <Image
            src="/user/main-hero.png"
            alt="병원 동행 파트너와 함께 걷는 어르신"
            width={640}
            height={480}
            priority
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </Section>
  );
}

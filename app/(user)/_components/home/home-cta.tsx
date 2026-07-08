import { ComingSoonButton } from "./coming-soon-button";
import { Section } from "./section";

export function HomeCta() {
  return (
    <Section>
      <div className="rounded-3xl bg-brand/5 px-6 py-14 text-center">
        <h2 className="text-2xl font-extrabold text-brand md:text-3xl">
          병원 동행, 함께가요
        </h2>
        <p className="mt-3 text-muted-foreground">
          지금 바로 신청하고 부모님의 병원길을 함께하세요.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ComingSoonButton className="rounded-lg bg-brand px-6 py-3 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand/90">
            동행 예약하기
          </ComingSoonButton>
          <ComingSoonButton className="rounded-lg border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted">
            전화 상담 받기
          </ComingSoonButton>
        </div>
      </div>
    </Section>
  );
}

import { Section } from "./section";
import { ComingSoonButton } from "./coming-soon-button";
import { ReviewsCarousel } from "./reviews-carousel";

export function Reviews() {
  return (
    <Section>
      <div className="rounded-3xl bg-muted/50 px-4 py-10 md:px-8">
        <h2 className="text-center text-2xl font-extrabold text-foreground md:text-3xl">
          실제 이용자 후기
        </h2>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          서비스 건수 <span className="font-bold text-brand">12,800건</span> 이상,
          서비스 만족도 <span className="font-bold text-brand">98%</span>
        </p>

        <ReviewsCarousel />

        <div className="mt-10 flex justify-center">
          <ComingSoonButton className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted">
            이용 후기 더 보기
          </ComingSoonButton>
        </div>
      </div>
    </Section>
  );
}

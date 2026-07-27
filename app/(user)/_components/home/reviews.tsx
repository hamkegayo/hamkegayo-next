import Link from "next/link";

import { Section } from "./section";
import { ReviewsCarousel } from "./reviews-carousel";

export function Reviews() {
    return (
        <Section>
            <div className="bg-muted/50 rounded-3xl px-4 py-10 md:px-8">
                <h2 className="text-foreground text-center text-2xl font-extrabold md:text-3xl">
                    실제 이용자 후기
                </h2>
                <p className="text-muted-foreground mt-3 text-center text-sm">
                    서비스 건수{" "}
                    <span className="text-brand font-bold">12,800건</span> 이상,
                    서비스 만족도{" "}
                    <span className="text-brand font-bold">98%</span>
                </p>

                <ReviewsCarousel />

                <div className="mt-10 flex justify-center">
                    <Link
                        href="/review"
                        className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-5 py-2.5 text-sm font-bold transition-colors"
                    >
                        이용 후기 더 보기
                    </Link>
                </div>
            </div>
        </Section>
    );
}

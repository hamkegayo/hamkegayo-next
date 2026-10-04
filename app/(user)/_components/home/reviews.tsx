import Link from "next/link";

import { Section } from "./section";
import { ReviewsCarousel } from "./reviews-carousel";

import { getReviews } from "@/app/(user)/review/_lib/reviews.server";

export async function Reviews() {
    const reviews = await getReviews(6);
    return (
        <Section>
            <div className="bg-panel-muted rounded-3xl px-4 py-10 md:px-8">
                <h2 className="text-foreground text-center text-2xl font-extrabold md:text-3xl">
                    실제 이용자 후기
                </h2>
                <p className="text-description-foreground mt-3 text-center text-sm">
                    함께가요 이용자가 남겨주신 이야기를 확인해 보세요.
                </p>

                {reviews.length > 0 ? (
                    <ReviewsCarousel reviews={reviews} />
                ) : (
                    <p className="text-muted-foreground mt-8 text-center text-sm">
                        현재 표시할 후기가 없습니다.
                    </p>
                )}

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

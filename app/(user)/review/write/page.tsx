import type { Metadata } from "next";

import { getReviewableServices } from "../_lib/reviews.server";
import { ReviewWriteView } from "./review-write-view";

export const metadata: Metadata = {
    title: "후기 작성",
    robots: { index: false, follow: false },
};

export default async function ReviewWritePage() {
    const services = await getReviewableServices();
    return <ReviewWriteView services={services} />;
}

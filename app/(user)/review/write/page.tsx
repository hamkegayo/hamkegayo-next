import { getReviewableServices } from "../_lib/reviews.server";
import { ReviewWriteView } from "./review-write-view";

export default async function ReviewWritePage() {
    const services = await getReviewableServices();
    return <ReviewWriteView services={services} />;
}

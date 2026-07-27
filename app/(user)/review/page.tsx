import { getReviews } from "./_lib/reviews.server";
import { ReviewsListView } from "./reviews-list-view";

export default async function ReviewListPage() {
    const reviews = await getReviews();
    return <ReviewsListView reviews={reviews} />;
}

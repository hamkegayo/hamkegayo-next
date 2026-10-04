import { createClient } from "@/utils/supabase/server";
import { planDisplay, type PlanCode } from "@/lib/reservation";
import { formatUseDate, kstDate } from "@/lib/format";

export type ReviewPlan = "Basic" | "Plus";

/** 공개 후기 뷰 */
export type ReviewView = {
    id: string;
    plan: ReviewPlan;
    title: string;
    author: string;
    rating: number;
    date: string;
    content: string;
    reply: string | null;
    source: "site" | "provided";
};

/** 작성 가능한(완료·미작성) 서비스 */
export type ReviewableService = {
    serviceId: string;
    hospital: string;
    plan: ReviewPlan;
    dateLabel: string;
};

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return kstDate(d) ?? iso.slice(0, 10);
}

function formatServiceDate(useDate: string): string {
    return formatUseDate(useDate);
}

type ReviewRow = {
    id: string;
    plan: string;
    rating: number;
    title: string;
    content: string;
    author_masked: string;
    reply: string | null;
    published_at: string;
    source: "site" | "provided";
};

function toView(r: ReviewRow): ReviewView {
    return {
        id: r.id,
        plan: planDisplay(r.plan === "plus" ? "plus" : "basic"),
        title: r.title,
        author: r.author_masked,
        rating: r.rating,
        date: formatDate(r.published_at),
        content: r.content,
        reply: r.reply,
        source: r.source,
    };
}

/** 공개 필드만 반환하는 RPC: 기존 서비스 후기와 제공 후기를 최신순으로 결합. */
export async function getReviews(limit = 10000): Promise<ReviewView[]> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc("get_public_reviews", {
            p_limit: limit,
        });
        if (error) {
            console.error("공개 후기 조회 실패", error.code);
            return [];
        }
        return ((data ?? []) as unknown as ReviewRow[]).map(toView);
    } catch {
        return [];
    }
}

/** 날짜가 같은 후기까지 ID 순서로 안정적으로 탐색한다. */
export async function getReviewWithAdjacent(id: string): Promise<{
    review: ReviewView | null;
    prev: { id: string; title: string } | null;
    next: { id: string; title: string } | null;
}> {
    const reviews = await getReviews();
    const index = reviews.findIndex((r) => r.id === id);
    if (index < 0) return { review: null, prev: null, next: null };
    const adjacent = (r: ReviewView | undefined) =>
        r ? { id: r.id, title: r.title } : null;
    return {
        review: reviews[index],
        prev: adjacent(reviews[index - 1]),
        next: adjacent(reviews[index + 1]),
    };
}

type ReviewableRow = {
    id: string;
    reservations: {
        plan: string;
        hospital_address: string;
        use_date: string;
    } | null;
    reviews: { id: string }[] | null;
};

/** 로그인 고객의 완료 서비스 중 후기 미작성 목록 */
export async function getReviewableServices(): Promise<ReviewableService[]> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from("services")
            .select(
                "id, reservations!inner(plan, hospital_address, use_date), reviews(id)",
            )
            .eq("status", "COMPLETED")
            .order("created_at", { ascending: false })
            .returns<ReviewableRow[]>();

        if (error || !data) return [];

        return data
            .filter((s) => (s.reviews ?? []).length === 0)
            .map((s) => {
                const res = s.reservations;
                const planCode: PlanCode =
                    res?.plan === "plus" ? "plus" : "basic";
                return {
                    serviceId: s.id,
                    hospital: res?.hospital_address ?? "",
                    plan: planDisplay(planCode),
                    dateLabel: res ? formatServiceDate(res.use_date) : "",
                };
            });
    } catch {
        return [];
    }
}

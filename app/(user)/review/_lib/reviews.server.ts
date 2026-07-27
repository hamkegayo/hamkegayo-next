import { createClient } from "@/utils/supabase/server";
import { planDisplay, type PlanCode } from "@/lib/reservation";

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
};

/** 작성 가능한(완료·미작성) 서비스 */
export type ReviewableService = {
    serviceId: string;
    hospital: string;
    plan: ReviewPlan;
    dateLabel: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatServiceDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    return `${y}.${String(mo).padStart(2, "0")}.${String(d).padStart(2, "0")} (${weekday})`;
}

type ReviewRow = {
    id: string;
    rating: number;
    title: string;
    content: string;
    author_masked: string;
    reply: string | null;
    created_at: string;
    services: { reservations: { plan: string } | null } | null;
};

function toView(r: ReviewRow): ReviewView {
    const planCode: PlanCode =
        r.services?.reservations?.plan === "plus" ? "plus" : "basic";
    return {
        id: r.id,
        plan: planDisplay(planCode),
        title: r.title,
        author: r.author_masked,
        rating: r.rating,
        date: formatDate(r.created_at),
        content: r.content,
        reply: r.reply,
    };
}

const SELECT =
    "id, rating, title, content, author_masked, reply, created_at, services!inner(reservations!inner(plan))";

/** 전체 공개 후기 (최신순) */
export async function getReviews(): Promise<ReviewView[]> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("reviews")
            .select(SELECT)
            .order("created_at", { ascending: false })
            .returns<ReviewRow[]>();
        if (error || !data) return [];
        return data.map(toView);
    } catch {
        return [];
    }
}

/** 후기 단건 + 이전(더 최신)/다음(더 과거) */
export async function getReviewWithAdjacent(id: string): Promise<{
    review: ReviewView | null;
    prev: { id: string; title: string } | null;
    next: { id: string; title: string } | null;
}> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("reviews")
            .select(SELECT)
            .eq("id", id)
            .maybeSingle<ReviewRow>();
        if (error || !data) return { review: null, prev: null, next: null };

        const [{ data: prevRows }, { data: nextRows }] = await Promise.all([
            supabase
                .from("reviews")
                .select("id, title, created_at")
                .gt("created_at", data.created_at)
                .order("created_at", { ascending: true })
                .limit(1),
            supabase
                .from("reviews")
                .select("id, title, created_at")
                .lt("created_at", data.created_at)
                .order("created_at", { ascending: false })
                .limit(1),
        ]);

        const prev = prevRows?.[0]
            ? { id: prevRows[0].id, title: prevRows[0].title }
            : null;
        const next = nextRows?.[0]
            ? { id: nextRows[0].id, title: nextRows[0].title }
            : null;

        return { review: toView(data), prev, next };
    } catch {
        return { review: null, prev: null, next: null };
    }
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

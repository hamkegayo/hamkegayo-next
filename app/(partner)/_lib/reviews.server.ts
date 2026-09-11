/**
 * 파트너가 받은 후기 조회 — 서버 전용.
 *
 *  정산 관리의 '후기 확인' 이 준비중 토스트만 띄우고 있었다. 데이터는 이미
 *  있었다 — 파트너 홈의 '누적 평점' 이 같은 테이블을 읽는다(home.server.ts).
 *  목록을 보여 줄 화면만 없었다.
 *
 *  reviews 는 조회 정책이 전체 공개(reviews_select_public)라 마이그레이션이
 *  필요 없다. 다만 **본인 것만** 읽도록 partner_id 를 항상 건다 — 정책이
 *  열려 있다고 화면까지 열어 둘 이유는 없다.
 *
 *  ⚠️ 작성자는 `author_masked`(예: 홍O동) 만 쓴다. 원본 이름을 쓰지 않는다.
 *     처리방침 제5조가 공개한 파트너 제공 범위를 후기가 우회하면 안 된다.
 */

import { createClient } from "@/utils/supabase/server";
import { kstDate } from "@/lib/format";

export type PartnerReview = {
    id: string;
    rating: number;
    title: string;
    content: string;
    /** 마스킹된 작성자명 (예: 홍O동) */
    author: string;
    /** "YYYY.MM.DD" */
    dateLabel: string;
    /** 운영팀 답변 (없으면 null) */
    reply: string | null;
};

export type PartnerReviewSummary = {
    reviews: PartnerReview[];
    /** 평균 평점 (후기 없으면 null) */
    average: number | null;
    /** 별점별 건수 — index 0 이 1점 */
    distribution: [number, number, number, number, number];
};

type Row = {
    id: string;
    rating: number;
    title: string;
    content: string;
    author_masked: string;
    reply: string | null;
    created_at: string;
};

const EMPTY: PartnerReviewSummary = {
    reviews: [],
    average: null,
    distribution: [0, 0, 0, 0, 0],
};

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return kstDate(d) ?? iso.slice(0, 10);
}

/** 로그인 파트너가 받은 후기. 비로그인·조회 실패 시 빈 요약. */
export async function getMyPartnerReviews(): Promise<PartnerReviewSummary> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return EMPTY;

        const { data, error } = await supabase
            .from("reviews")
            .select(
                "id, rating, title, content, author_masked, reply, created_at",
            )
            .eq("partner_id", user.id)
            .order("created_at", { ascending: false })
            .returns<Row[]>();

        if (error || !data || data.length === 0) return EMPTY;

        const distribution: [number, number, number, number, number] = [
            0, 0, 0, 0, 0,
        ];
        let sum = 0;
        for (const r of data) {
            sum += r.rating;
            if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1] += 1;
        }

        return {
            reviews: data.map((r) => ({
                id: r.id,
                rating: r.rating,
                title: r.title,
                content: r.content,
                author: r.author_masked,
                dateLabel: formatDate(r.created_at),
                reply: r.reply,
            })),
            average: sum / data.length,
            distribution,
        };
    } catch {
        return EMPTY;
    }
}

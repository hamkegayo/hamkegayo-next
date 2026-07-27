import { createClient } from "@/utils/supabase/server";
import {
    getPartnerMatchingRequests,
    type PartnerMatchingItem,
} from "./requests.server";
import {
    getPartnerTodayServices,
    type PartnerServiceView,
} from "./services.server";
import { getPartnerPendingReportCount } from "./reports.server";

/** 파트너 홈 대시보드 요약 (실데이터) */
export type PartnerHomeSummary = {
    /** 수락 대기(MATCHING) 요청 목록 + 개수 */
    newRequests: PartnerMatchingItem[];
    newRequestCount: number;
    /** 오늘 진행 예정/진행중 서비스 목록 + 개수 */
    todaySchedules: PartnerServiceView[];
    todayCount: number;
    /** 작성이 필요한(미제출) 리포트 수 */
    pendingReportCount: number;
    /** 누적 평점(리뷰 없으면 null) + 리뷰 수 */
    avgRating: number | null;
    ratingCount: number;
};

/** 로그인 파트너의 누적 평점 요약 */
async function getRatingSummary(): Promise<{
    avg: number | null;
    count: number;
}> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { avg: null, count: 0 };

        const { data, error } = await supabase
            .from("reviews")
            .select("rating")
            .eq("partner_id", user.id)
            .returns<{ rating: number }[]>();

        if (error || !data || data.length === 0) return { avg: null, count: 0 };
        const sum = data.reduce((acc, r) => acc + r.rating, 0);
        return { avg: sum / data.length, count: data.length };
    } catch {
        return { avg: null, count: 0 };
    }
}

/**
 * 파트너 홈에 필요한 데이터를 한 번에 조립한다.
 * 개별 조회는 각자 실패 시 빈 값으로 처리되므로 홈은 항상 렌더 가능.
 */
export async function getPartnerHomeSummary(): Promise<PartnerHomeSummary> {
    const [newRequests, todaySchedules, pendingReportCount, rating] =
        await Promise.all([
            getPartnerMatchingRequests(),
            getPartnerTodayServices(),
            getPartnerPendingReportCount(),
            getRatingSummary(),
        ]);

    return {
        newRequests,
        newRequestCount: newRequests.length,
        todaySchedules,
        todayCount: todaySchedules.length,
        pendingReportCount,
        avgRating: rating.avg,
        ratingCount: rating.count,
    };
}

import { createClient } from "@/utils/supabase/server";

/** 수락 대기 목록(파트너 화면)에 표시할 최소 필드 */
export type PartnerMatchingItem = {
    id: string;
    plan: "Basic" | "Plus";
    /** 병원 표시명 — 스키마에 병원 이름 컬럼이 없어 주소를 그대로 노출 */
    hospital: string;
    /** 목록 부제 — 진료 내용(treatment) */
    type: string;
    /** "오늘/내일/M월 D일 HH:mm" 형태의 노출용 라벨 */
    listTime: string;
    /** 예상 소요시간(원본 duration 문자열) */
    duration: string;
};

/** DB(reservations)에서 실제로 읽어오는 행 형태 */
type MatchingRow = {
    id: string;
    plan: string;
    treatment: string;
    hospital_address: string;
    use_date: string;
    reserve_time: string;
    duration: string;
};

/** basic/plus → Basic/Plus */
function planLabel(plan: string): "Basic" | "Plus" {
    return plan === "plus" ? "Plus" : "Basic";
}

/** "HH:mm:ss"/"HH:mm" → "HH:mm" (그 외 형태면 원본 유지) */
function toHhmm(reserveTime: string): string {
    const m = /^(\d{1,2}):(\d{2})/.exec(reserveTime.trim());
    if (!m) return reserveTime;
    return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * use_date(YYYY-MM-DD) + reserve_time → "오늘/내일/M월 D일 HH:mm" 라벨.
 * 오늘/내일은 서버 로컬 날짜 기준으로 판별한다.
 */
function formatListTime(useDate: string, reserveTime: string): string {
    const hhmm = toHhmm(reserveTime);

    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return `${useDate} ${hhmm}`;

    const target = new Date(y, mo - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round(
        (target.getTime() - today.getTime()) / 86_400_000,
    );

    if (diffDays === 0) return `오늘 ${hhmm}`;
    if (diffDays === 1) return `내일 ${hhmm}`;
    return `${mo}월 ${d}일 ${hhmm}`;
}

/**
 * 로그인한 파트너에게 내려줄 MATCHING(수락 대기) 예약 목록.
 *  - status = MATCHING 만 조회 (RLS 상 파트너에게 MATCHING 만 노출됨)
 *  - 이 파트너가 이미 지원(수락/거절/대기 등)한 예약은 제외
 *  - 가까운 일정 순(use_date, reserve_time) 정렬
 *
 * 비로그인/비파트너/조회 실패 시 빈 배열을 반환한다(화면은 빈 상태로 처리).
 */
export async function getPartnerMatchingRequests(): Promise<
    PartnerMatchingItem[]
> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        // 이 파트너가 이미 지원한 예약 id(중복 노출 방지)
        const { data: applied } = await supabase
            .from("reservation_applications")
            .select("reservation_id")
            .eq("partner_id", user.id);

        const excludeIds = (applied ?? []).map((a) => a.reservation_id);

        let query = supabase
            .from("reservations")
            .select(
                "id, plan, treatment, hospital_address, use_date, reserve_time, duration",
            )
            .eq("status", "MATCHING")
            .order("use_date", { ascending: true })
            .order("reserve_time", { ascending: true });

        if (excludeIds.length > 0) {
            query = query.not("id", "in", `(${excludeIds.join(",")})`);
        }

        const { data, error } = await query.returns<MatchingRow[]>();
        if (error || !data) return [];

        return data.map((r) => ({
            id: r.id,
            plan: planLabel(r.plan),
            hospital: r.hospital_address,
            type: r.treatment,
            listTime: formatListTime(r.use_date, r.reserve_time),
            duration: r.duration,
        }));
    } catch {
        return [];
    }
}

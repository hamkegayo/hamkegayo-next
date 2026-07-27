import { createClient } from "@/utils/supabase/server";
import { expirePastMatchings } from "@/lib/expire-matchings";
import { planDisplay, planPrice, type PlanCode } from "@/lib/reservation";

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

/** basic/plus → Basic/Plus (공용 헬퍼 래핑, 알 수 없는 값은 Basic) */
function planLabel(plan: string): "Basic" | "Plus" {
    return planDisplay(plan === "plus" ? "plus" : "basic");
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
 * 로그인한 파트너의 수락 대기(MATCHING) 건수.
 *  - 목록과 동일한 제외 규칙(이미 지원한 예약 제외)을 적용한다.
 *  - 사이드바 뱃지 등 개수만 필요한 곳에서 사용(행 데이터는 읽지 않음).
 */
export async function getPartnerMatchingCount(): Promise<number> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return 0;

        await expirePastMatchings();

        const { data: applied } = await supabase
            .from("reservation_applications")
            .select("reservation_id")
            .eq("partner_id", user.id);

        const excludeIds = (applied ?? []).map((a) => a.reservation_id);

        let query = supabase
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .eq("status", "MATCHING");

        if (excludeIds.length > 0) {
            query = query.not("id", "in", `(${excludeIds.join(",")})`);
        }

        const { count, error } = await query;
        if (error) return 0;
        return count ?? 0;
    } catch {
        return 0;
    }
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

        await expirePastMatchings();

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

// =============================================================
// 상세 조회 (수락/거절 화면)
// =============================================================

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export type PartnerRequestDetail = {
    id: string;
    code: string;
    plan: "Basic" | "Plus";
    /** "베이직 서비스" / "플러스 서비스" */
    serviceType: string;
    /** 원본 예약 상태(MATCHING/CONFIRMED/...) */
    status: string;
    /** 수락/거절 가능 여부 = MATCHING 이면서 아직 미지원 */
    canAct: boolean;
    /** 병원 표시명 — 주소를 그대로 노출(스키마에 병원명 컬럼 없음) */
    hospital: string;
    hospitalDate: string;
    hospitalTime: string;
    arriveDate: string;
    arriveTime: string;
    estDuration: string;
    amount: number;
    departure: string;
    customer: {
        name: string;
        age: string;
        gender: string;
        treatment: string;
        purpose: string;
        cautions: string[];
        requests: string[];
    };
};

type DetailRow = {
    id: string;
    code: string;
    status: string;
    plan: string;
    patient_name: string;
    patient_birth: string;
    patient_gender: string;
    treatment: string;
    purpose: string;
    cautions: string | null;
    other_requests: string | null;
    use_date: string;
    arrive_time: string;
    reserve_time: string;
    duration: string;
    depart_address: string;
    hospital_address: string;
};

/** "YYYY-MM-DD" → "YYYY.MM.DD (요일)" */
function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}.${mm}.${dd} (${weekday})`;
}

/** patient_birth("YYYY-MM-DD") → "N세" (만 나이) */
function ageLabel(birth: string): string {
    const [y, mo, d] = birth.split("-").map((n) => Number(n));
    if (!y) return "";
    const now = new Date();
    let age = now.getFullYear() - y;
    const beforeBirthday =
        now.getMonth() + 1 < mo ||
        (now.getMonth() + 1 === mo && now.getDate() < d);
    if (beforeBirthday) age -= 1;
    return `${age}세`;
}

/** 여러 줄 텍스트 → 빈 줄 제거한 항목 배열 */
function toLines(text: string | null): string[] {
    if (!text) return [];
    return text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * 상세(수락/거절) 화면용 단건 예약 조회.
 *  - RLS 상 파트너는 MATCHING 또는 본인이 ACCEPTED 지원한 예약만 SELECT 가능.
 *  - 조회 실패/권한 없음/비로그인 시 null 을 반환(화면은 "찾을 수 없음" 처리).
 */
export async function getPartnerRequestDetail(
    reservationId: string,
): Promise<PartnerRequestDetail | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from("reservations")
            .select(
                "id, code, status, plan, patient_name, patient_birth, patient_gender, treatment, purpose, cautions, other_requests, use_date, arrive_time, reserve_time, duration, depart_address, hospital_address",
            )
            .eq("id", reservationId)
            .maybeSingle<DetailRow>();

        if (error || !data) return null;

        // 이미 이 예약에 지원(수락/거절 등)했는지 → 버튼 노출 판단
        const { data: applied } = await supabase
            .from("reservation_applications")
            .select("id")
            .eq("reservation_id", reservationId)
            .eq("partner_id", user.id)
            .maybeSingle();

        const planCode: PlanCode = data.plan === "plus" ? "plus" : "basic";
        const plan = planDisplay(planCode);

        return {
            id: data.id,
            code: data.code,
            plan,
            serviceType: plan === "Plus" ? "플러스 서비스" : "베이직 서비스",
            status: data.status,
            canAct: data.status === "MATCHING" && !applied,
            hospital: data.hospital_address,
            hospitalDate: formatDate(data.use_date),
            hospitalTime: toHhmm(data.reserve_time),
            arriveDate: formatDate(data.use_date),
            arriveTime: toHhmm(data.arrive_time),
            estDuration: data.duration,
            amount: planPrice(planCode),
            departure: data.depart_address,
            customer: {
                name: data.patient_name,
                age: ageLabel(data.patient_birth),
                gender: data.patient_gender === "male" ? "남성" : "여성",
                treatment: data.treatment,
                purpose: data.purpose,
                cautions: toLines(data.cautions),
                requests: toLines(data.other_requests),
            },
        };
    } catch {
        return null;
    }
}

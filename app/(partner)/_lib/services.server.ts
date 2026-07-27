import { createClient } from "@/utils/supabase/server";
import {
    planDisplay,
    planPrice,
    type PlanCode,
    type ServiceState,
} from "@/lib/reservation";

/** 진행 관리 목록/상세 공용 뷰 */
export type PartnerServiceView = {
    id: string;
    state: ServiceState;
    plan: "Basic" | "Plus";
    /** 병원 표시명 — 주소 그대로(스키마에 병원명 컬럼 없음) */
    hospital: string;
    type: string;
    customerName: string;
    customerAge: string;
    dateLabel: string;
    timeLabel: string;
    amount: number;
    code: string;
    /** 시작/종료 기록 시각(없으면 null) */
    startedAtLabel: string | null;
    endedAtLabel: string | null;
    startMemo: string | null;
    endMemo: string | null;
};

type ServiceRow = {
    id: string;
    status: ServiceState;
    started_at: string | null;
    ended_at: string | null;
    start_memo: string | null;
    end_memo: string | null;
    reservations: {
        code: string;
        plan: string;
        hospital_address: string;
        treatment: string;
        patient_name: string;
        patient_birth: string;
        use_date: string;
        reserve_time: string;
    } | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    return `${y}.${String(mo).padStart(2, "0")}.${String(d).padStart(2, "0")} (${weekday})`;
}

function toHhmm(time: string): string {
    const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : time;
}

/** ISO → "HH:mm" (기록 시각 표시용) */
function toTimeLabel(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ageLabel(birth: string): string {
    const [y, mo, d] = birth.split("-").map((n) => Number(n));
    if (!y) return "";
    const now = new Date();
    let age = now.getFullYear() - y;
    if (
        now.getMonth() + 1 < mo ||
        (now.getMonth() + 1 === mo && now.getDate() < d)
    ) {
        age -= 1;
    }
    return `${age}세`;
}

const SELECT =
    "id, status, started_at, ended_at, start_memo, end_memo, reservations!inner(code, plan, hospital_address, treatment, patient_name, patient_birth, use_date, reserve_time)";

function toView(r: ServiceRow): PartnerServiceView {
    const res = r.reservations;
    const planCode: PlanCode = res?.plan === "plus" ? "plus" : "basic";
    return {
        id: r.id,
        state: r.status,
        plan: planDisplay(planCode),
        hospital: res?.hospital_address ?? "",
        type: res?.treatment ?? "",
        customerName: res?.patient_name ?? "",
        customerAge: res ? ageLabel(res.patient_birth) : "",
        dateLabel: res ? formatDate(res.use_date) : "",
        timeLabel: res ? toHhmm(res.reserve_time) : "",
        amount: planPrice(planCode),
        code: res?.code ?? "",
        startedAtLabel: toTimeLabel(r.started_at),
        endedAtLabel: toTimeLabel(r.ended_at),
        startMemo: r.start_memo,
        endMemo: r.end_memo,
    };
}

/** 로그인 파트너의 서비스(진행 관리) 목록 — 최신순 */
export async function getPartnerServices(): Promise<PartnerServiceView[]> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from("services")
            .select(SELECT)
            .eq("partner_id", user.id)
            .order("created_at", { ascending: false })
            .returns<ServiceRow[]>();

        if (error || !data) return [];
        return data.map(toView);
    } catch {
        return [];
    }
}

/** 서비스 단건(진행 관리 상세) */
export async function getPartnerService(
    serviceId: string,
): Promise<PartnerServiceView | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from("services")
            .select(SELECT)
            .eq("id", serviceId)
            .eq("partner_id", user.id)
            .maybeSingle<ServiceRow>();

        if (error || !data) return null;
        return toView(data);
    } catch {
        return null;
    }
}

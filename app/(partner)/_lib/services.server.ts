import { createClient } from "@/utils/supabase/server";
import { toHhmm } from "@/lib/format";
import {
    planDisplay,
    type PlanCode,
    type ServiceState,
} from "@/lib/reservation";
import { calcPartnerPayout, formatMinutes } from "@/lib/pricing";

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
    /** 파트너 실지급 예상액(원) — 최종 요금(없으면 선결제액)에서 수수료를 뺀 값 */
    amount: number;
    /** 산정 기준 금액(원) — 고객이 결제하는 총액 */
    grossAmount: number;
    /** 최종 산정 전이면 true (선결제액 기준의 잠정 금액) */
    amountProvisional: boolean;
    /** 이용시간 표기 — 확정 전에는 예상 소요시간, 확정 후에는 청구 시간 */
    durationLabel: string;
    /** 주말·공휴일 30% 할증 적용 여부 */
    surcharged: boolean;
    code: string;
    /** 도착/시작/종료 기록 시각(없으면 null) */
    arrivedAtLabel: string | null;
    startedAtLabel: string | null;
    endedAtLabel: string | null;
    startMemo: string | null;
    endMemo: string | null;
    /** 단계별 진행 시각 (#55). 키는 DB 컬럼명과 같다. */
    times: Record<string, string | null>;
    /** 이용자 미도착으로 종료된 건 (약관 제15조 ③) */
    noShow: boolean;
    /** 시스템이 마감한 건. 실제 종료가 아니라는 표시 */
    autoClosedAt: string | null;
    /**
     * 수행 조건 — 매뉴얼 1장이 업무 시작 조건으로 정한 항목 (#77).
     * 인계자 성명·연락처는 **제3자 개인정보**라 확정 후에만 들어온다.
     */
    conditions: PlanDetail;
};

export type PlanDetail = {
    transportTo: string | null;
    transportHome: string | null;
    endMethod: string | null;
    notifyTarget: string | null;
    shareMedicalInfo: boolean;
    handover: HandoverPerson | null;
    backupHandover: HandoverPerson | null;
};

export type HandoverPerson = {
    name: string;
    relation: string | null;
    phone: string | null;
};

type ServiceRow = {
    id: string;
    status: ServiceState;
    arrived_at: string | null;
    started_at: string | null;
    ended_at: string | null;
    start_memo: string | null;
    end_memo: string | null;
    notified_at: string | null;
    hospital_arrived_at: string | null;
    reception_at: string | null;
    wait_started_at: string | null;
    wait_ended_at: string | null;
    treatment_started_at: string | null;
    treatment_ended_at: string | null;
    checkout_started_at: string | null;
    checkout_ended_at: string | null;
    home_departed_at: string | null;
    handover_at: string | null;
    no_show: boolean | null;
    auto_closed_at: string | null;
    reservations: {
        code: string;
        plan: string;
        hospital_address: string;
        treatment: string;
        patient_name: string;
        patient_birth: string;
        use_date: string;
        reserve_time: string;
        duration: string;
        surcharge_rate: number | string | null;
        prepaid_amount: number | null;
        billed_minutes: number | null;
        final_amount: number | null;
        transport_to: string | null;
        transport_home: string | null;
        end_method: string | null;
        notify_target: string | null;
        share_medical_info: boolean | null;
        handover_name: string | null;
        handover_relation: string | null;
        handover_phone: string | null;
        backup_handover_name: string | null;
        backup_handover_relation: string | null;
        backup_handover_phone: string | null;
    } | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    return `${y}.${String(mo).padStart(2, "0")}.${String(d).padStart(2, "0")} (${weekday})`;
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
    "id, status, arrived_at, started_at, ended_at, start_memo, end_memo, " +
    // 매뉴얼이 각 단계에서 기록하라고 정한 시각 (#55).
    // 약관 제12조 ④ 가 이용시간 분쟁 시 함께 확인하는 자료다.
    "notified_at, hospital_arrived_at, reception_at, wait_started_at, wait_ended_at, " +
    "treatment_started_at, treatment_ended_at, checkout_started_at, checkout_ended_at, " +
    "home_departed_at, handover_at, no_show, auto_closed_at, " +
    "reservations!inner(code, plan, hospital_address, treatment, patient_name, patient_birth, " +
    "use_date, reserve_time, duration, surcharge_rate, prepaid_amount, billed_minutes, final_amount, " +
    // 확정 후에만 제공되는 단계 2 항목 (#77 · 처리방침 제5조 ②).
    // 인계자는 이용자 본인이 아닌 제3자의 개인정보다.
    "transport_to, transport_home, end_method, notify_target, share_medical_info, " +
    "handover_name, handover_relation, handover_phone, " +
    "backup_handover_name, backup_handover_relation, backup_handover_phone)";

function toView(r: ServiceRow): PartnerServiceView {
    const res = r.reservations;
    const planCode: PlanCode = res?.plan === "plus" ? "plus" : "basic";

    // 최종 산정 전에는 선결제액을 잠정 기준으로 보여준다.
    const grossAmount = res?.final_amount ?? res?.prepaid_amount ?? 0;
    const payout = calcPartnerPayout(planCode, grossAmount);

    const person = (
        name: string | null | undefined,
        relation: string | null | undefined,
        phone: string | null | undefined,
    ): HandoverPerson | null =>
        name?.trim()
            ? {
                  name: name.trim(),
                  relation: relation?.trim() || null,
                  phone: phone?.trim() || null,
              }
            : null;

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
        amount: payout.net,
        grossAmount,
        amountProvisional: res?.final_amount == null,
        durationLabel: res?.billed_minutes
            ? formatMinutes(res.billed_minutes)
            : (res?.duration ?? ""),
        surcharged: Number(res?.surcharge_rate ?? 0) > 0,
        code: res?.code ?? "",
        arrivedAtLabel: toTimeLabel(r.arrived_at),
        startedAtLabel: toTimeLabel(r.started_at),
        endedAtLabel: toTimeLabel(r.ended_at),
        startMemo: r.start_memo,
        endMemo: r.end_memo,
        times: {
            notified_at: r.notified_at,
            hospital_arrived_at: r.hospital_arrived_at,
            reception_at: r.reception_at,
            wait_started_at: r.wait_started_at,
            wait_ended_at: r.wait_ended_at,
            treatment_started_at: r.treatment_started_at,
            treatment_ended_at: r.treatment_ended_at,
            checkout_started_at: r.checkout_started_at,
            checkout_ended_at: r.checkout_ended_at,
            home_departed_at: r.home_departed_at,
            handover_at: r.handover_at,
        },
        noShow: r.no_show === true,
        autoClosedAt: r.auto_closed_at,
        conditions: {
            transportTo: res?.transport_to ?? null,
            transportHome: res?.transport_home ?? null,
            endMethod: res?.end_method ?? null,
            notifyTarget: res?.notify_target ?? null,
            shareMedicalInfo: res?.share_medical_info === true,
            handover: person(
                res?.handover_name,
                res?.handover_relation,
                res?.handover_phone,
            ),
            backupHandover: person(
                res?.backup_handover_name,
                res?.backup_handover_relation,
                res?.backup_handover_phone,
            ),
        },
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

/** 로컬 기준 오늘 날짜(YYYY-MM-DD) */
function localToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 진행 관리 뱃지용 카운트 — 아직 완료되지 않은(진행 예정/진행중) 서비스 수.
 * 비로그인/조회 실패 시 0.
 */
export async function getPartnerActiveCount(): Promise<number> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return 0;

        const { count, error } = await supabase
            .from("services")
            .select("id", { count: "exact", head: true })
            .eq("partner_id", user.id)
            .in("status", ["SCHEDULED", "IN_PROGRESS"]);

        if (error) return 0;
        return count ?? 0;
    } catch {
        return 0;
    }
}

/**
 * 오늘(use_date=오늘) 진행 예정/진행중 서비스 — 파트너 홈 "오늘 일정"용.
 * 시간(HH:mm) 오름차순 정렬.
 */
export async function getPartnerTodayServices(): Promise<PartnerServiceView[]> {
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
            .in("status", ["SCHEDULED", "IN_PROGRESS"])
            .eq("reservations.use_date", localToday())
            .returns<ServiceRow[]>();

        if (error || !data) return [];
        return data
            .map(toView)
            .sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
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

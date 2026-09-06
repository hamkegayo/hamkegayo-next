import { createClient } from "@/utils/supabase/server";
import { toHhmm } from "@/lib/format";
import { createAdminClient } from "@/utils/supabase/admin";
import {
    PLAN_INFO,
    RESERVATION_STATUS_LABEL,
    type PlanCode,
    type ReservationStatus,
    type ServiceState,
} from "@/lib/reservation";
import {
    MIN_PREPAY_MIN,
    baseAmountFor,
    calcPrepayment,
    calcSettlementDiff,
    formatMinutes,
    parseDurationMinutes,
} from "@/lib/pricing";

export type DetailQualification = { type: string; issuer: string | null };

export type DetailPartner = {
    name: string;
    rating: number | null;
    reviewCount: number;
    qualifications: DetailQualification[];
};

/** 결제 내역 — 서비스 종료 전에는 선결제 기준의 예상값(#46) */
export type ReservationPayment = {
    /** 청구(또는 예상) 이용시간 표기 */
    durationLabel: string;
    /** 할증 전 이용요금 */
    baseAmount: number;
    /** 주말·공휴일 30% 할증액 (약관 제13조 ①) */
    surchargeAmount: number;
    /** 이용요금 합계 */
    total: number;
    /** 선결제액 (약관 제21조 ①) */
    prepaidAmount: number;
    /** 환불 예정액 (약관 제21조 ④) */
    refund: number;
    /** 추가결제액 (약관 제21조 ⑤) */
    additional: number;
    /** 서비스 종료 후 최종 산정이 끝났는지 */
    isFinal: boolean;
};

/** 확정/완료/취소 예약의 리치 상세 뷰 */
export type ReservationDetailView = {
    id: string;
    code: string;
    createdAtLabel: string;
    status: ReservationStatus;
    statusLabel: string;
    planLabel: string;
    hospitalVisitLabel: string;
    partnerArriveLabel: string;
    hospital: string;
    departAddress: string;
    userName: string;
    userGender: string;
    userBirth: string;
    userPhone: string;
    cautions: string | null;
    otherRequests: string | null;
    payment: ReservationPayment;
    includes: string[];
    /** 서비스 진행 단계: 0=파트너 확정, 1=서비스 진행, 2=서비스 완료 */
    stepIndex: number;
    serviceState: ServiceState | null;
    confirmedAtLabel: string | null;
    startedAtLabel: string | null;
    endedAtLabel: string | null;
    /** 서비스 시작 전(SCHEDULED)이고 확정 상태여서 취소 가능한지 */
    canCancel: boolean;
    partner: DetailPartner | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 플랜별 서비스 포함 내용(제품 정의 — 정적) */
const PLAN_INCLUDES: Record<PlanCode, string[]> = {
    basic: [
        "병원에서 만남",
        "접수 및 수납 지원",
        "진료 및 검사 동행",
        "보호자 리포트 전달",
    ],
    plus: [
        "자택 방문 및 픽업",
        "병원 이동 지원",
        "접수 및 수납 지원",
        "진료 및 검사 동행",
        "귀가 동행 지원",
        "보호자 리포트 전달",
    ],
};

/** "YYYY-MM-DD" + 시간 → "YYYY. MM. DD (요일) 오전/오후 h:mm" */
function formatDateTime(useDate: string, time: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    const hhmm = toHhmm(time);
    const t = /^(\d{1,2}):(\d{2})/.exec(hhmm);
    if (!y || !mo || !d || !t) return `${useDate} ${time}`;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    const h24 = Number(t[1]);
    const meridiem = h24 < 12 ? "오전" : "오후";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${y}. ${String(mo).padStart(2, "0")}. ${String(d).padStart(2, "0")} (${weekday}) ${meridiem} ${h12}:${t[2]}`;
}

/** "YYYY-MM-DD" → "YYYY.MM.DD" */
function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    return `${y}.${String(mo).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
}

/** ISO → "MM.DD HH:mm" */
function formatStamp(iso: string | null): string | null {
    if (!iso) return null;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mi = String(dt.getMinutes()).padStart(2, "0");
    return `${mm}.${dd} ${hh}:${mi}`;
}

type ReservationRow = {
    id: string;
    code: string;
    created_at: string;
    status: ReservationStatus;
    plan: string;
    patient_name: string;
    patient_gender: string;
    patient_birth: string;
    patient_phone: string;
    cautions: string | null;
    other_requests: string | null;
    use_date: string;
    arrive_time: string;
    reserve_time: string;
    depart_address: string;
    hospital_address: string;
    confirmed_partner_id: string | null;
    duration: string;
    duration_minutes: number | null;
    surcharge_rate: number | string | null;
    prepaid_amount: number | null;
    billed_minutes: number | null;
    final_amount: number | null;
};

/**
 * 결제 내역 산정.
 *  - 종료 전 : 선결제액 기준의 예상값
 *  - 종료 후 : 저장된 최종 이용요금(final_amount)과 청구 시간(billed_minutes) 기준
 *  - 스냅샷이 없는 구 데이터는 그 자리에서 선결제액을 산정해 채운다.
 */
function toPayment(r: ReservationRow, plan: PlanCode): ReservationPayment {
    const surcharged = Number(r.surcharge_rate ?? 0) > 0;
    const durationMinutes =
        r.duration_minutes ??
        parseDurationMinutes(r.duration) ??
        MIN_PREPAY_MIN;

    const prepayment = calcPrepayment(plan, durationMinutes, surcharged);
    const prepaidAmount = r.prepaid_amount ?? prepayment.amount;

    const isFinal = r.final_amount != null;
    const billedMinutes = r.billed_minutes ?? prepayment.prepayMinutes;
    const total = r.final_amount ?? prepaidAmount;

    // 할증 전 금액은 청구 시간에서 되짚는다(총액 = 할증 전 × 1.3).
    const baseAmount = baseAmountFor(plan, billedMinutes);
    const diff = calcSettlementDiff(prepaidAmount, total);

    return {
        durationLabel: formatMinutes(billedMinutes),
        baseAmount,
        surchargeAmount: total - baseAmount,
        total,
        prepaidAmount,
        refund: isFinal ? diff.refund : 0,
        additional: isFinal ? diff.additional : 0,
        isFinal,
    };
}

type ServiceRow = {
    status: ServiceState;
    created_at: string;
    started_at: string | null;
    ended_at: string | null;
};

/** 확정 파트너 정보(이름·평점·자격) — admin 으로 조회(profiles RLS 우회) */
async function getConfirmedPartner(
    partnerId: string,
): Promise<DetailPartner | null> {
    try {
        const admin = createAdminClient();

        const [{ data: prof }, { data: reviews }, { data: quals }] =
            await Promise.all([
                admin
                    .from("profiles")
                    .select("name")
                    .eq("id", partnerId)
                    .maybeSingle<{ name: string }>(),
                admin
                    .from("reviews")
                    .select("rating")
                    .eq("partner_id", partnerId)
                    .returns<{ rating: number }[]>(),
                admin
                    .from("partner_qualifications")
                    .select("type, issuer")
                    .eq("partner_id", partnerId)
                    .eq("status", "VERIFIED")
                    .returns<{ type: string; issuer: string | null }[]>(),
            ]);

        if (!prof) return null;

        const list = reviews ?? [];
        const rating =
            list.length > 0
                ? list.reduce((a, r) => a + r.rating, 0) / list.length
                : null;

        return {
            name: prof.name,
            rating,
            reviewCount: list.length,
            qualifications: (quals ?? []).map((q) => ({
                type: q.type,
                issuer: q.issuer,
            })),
        };
    } catch {
        return null;
    }
}

/**
 * 확정/완료/취소 예약의 리치 상세.
 *  - reservation(소유 RLS) + service(소유 RLS) + 확정 파트너(admin)
 *  - 없거나 비소유 시 null.
 */
export async function getReservationDetail(
    reservationId: string,
): Promise<ReservationDetailView | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: r, error } = await supabase
            .from("reservations")
            .select(
                "id, code, created_at, status, plan, patient_name, patient_gender, patient_birth, patient_phone, cautions, other_requests, use_date, arrive_time, reserve_time, depart_address, hospital_address, confirmed_partner_id, duration, duration_minutes, surcharge_rate, prepaid_amount, billed_minutes, final_amount",
            )
            .eq("id", reservationId)
            .maybeSingle<ReservationRow>();

        if (error || !r) return null;

        // 서비스 행(확정 시 자동 생성). 소유자 RLS 로 조회 가능.
        const { data: svc } = await supabase
            .from("services")
            .select("status, created_at, started_at, ended_at")
            .eq("reservation_id", r.id)
            .maybeSingle<ServiceRow>();

        const planCode: PlanCode = r.plan === "plus" ? "plus" : "basic";

        const serviceState = svc?.status ?? null;
        const stepIndex =
            r.status === "COMPLETED" || serviceState === "COMPLETED"
                ? 2
                : serviceState === "IN_PROGRESS" || serviceState === "ENDED"
                  ? 1
                  : 0;

        const partner = r.confirmed_partner_id
            ? await getConfirmedPartner(r.confirmed_partner_id)
            : null;

        return {
            id: r.id,
            code: r.code,
            createdAtLabel: formatDate(r.created_at.slice(0, 10)),
            status: r.status,
            statusLabel: RESERVATION_STATUS_LABEL[r.status] ?? r.status,
            planLabel: PLAN_INFO[planCode].label,
            hospitalVisitLabel: formatDateTime(r.use_date, r.reserve_time),
            partnerArriveLabel: formatDateTime(r.use_date, r.arrive_time),
            hospital: r.hospital_address,
            departAddress: r.depart_address,
            userName: r.patient_name,
            userGender: r.patient_gender === "male" ? "남" : "여",
            userBirth: r.patient_birth,
            userPhone: r.patient_phone,
            cautions: r.cautions,
            otherRequests: r.other_requests,
            payment: toPayment(r, planCode),
            includes: PLAN_INCLUDES[planCode],
            stepIndex,
            serviceState,
            confirmedAtLabel: formatStamp(svc?.created_at ?? null),
            startedAtLabel: formatStamp(svc?.started_at ?? null),
            endedAtLabel: formatStamp(svc?.ended_at ?? null),
            canCancel:
                r.status === "CONFIRMED" &&
                (serviceState === null || serviceState === "SCHEDULED"),
            partner,
        };
    } catch {
        return null;
    }
}

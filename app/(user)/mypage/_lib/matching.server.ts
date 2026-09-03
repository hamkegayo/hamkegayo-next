import { createClient } from "@/utils/supabase/server";
import { toHhmm } from "@/lib/format";
import {
    planDisplay,
    RESERVATION_STATUS_LABEL,
    type PlanCode,
    type ReservationStatus,
} from "@/lib/reservation";

/** 고객 예약 요약 (매칭 선택/확정 화면용) */
export type CustomerReservation = {
    id: string;
    code: string;
    status: ReservationStatus;
    statusLabel: string;
    plan: "Basic" | "Plus";
    /** 병원 표시명 — 스키마에 병원명 컬럼이 없어 주소를 그대로 노출 */
    hospital: string;
    dateLabel: string;
    timeLabel: string;
    confirmedPartnerId: string | null;
};

/** ACCEPTED 지원 파트너 (지원자 선택 카드) */
export type ReservationApplicant = {
    partnerId: string;
    name: string;
    appliedAtLabel: string;
};

type ReservationRow = {
    id: string;
    code: string;
    status: ReservationStatus;
    plan: string;
    hospital_address: string;
    use_date: string;
    reserve_time: string;
    confirmed_partner_id: string | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "YYYY-MM-DD" → "YYYY.MM.DD (요일)" */
function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}.${mm}.${dd} (${weekday})`;
}

/** 지원 시각 라벨 (MM.DD HH:mm) */
function formatAppliedAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}.${dd} ${hh}:${mi}`;
}

/**
 * 로그인 고객의 예약 단건 조회 (본인 소유 RLS).
 * 없거나 비로그인/타인 예약이면 null.
 */
export async function getCustomerReservation(
    reservationId: string,
): Promise<CustomerReservation | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from("reservations")
            .select(
                "id, code, status, plan, hospital_address, use_date, reserve_time, confirmed_partner_id",
            )
            .eq("id", reservationId)
            .maybeSingle<ReservationRow>();

        if (error || !data) return null;

        const planCode: PlanCode = data.plan === "plus" ? "plus" : "basic";

        return {
            id: data.id,
            code: data.code,
            status: data.status,
            statusLabel: RESERVATION_STATUS_LABEL[data.status] ?? data.status,
            plan: planDisplay(planCode),
            hospital: data.hospital_address,
            dateLabel: formatDate(data.use_date),
            timeLabel: toHhmm(data.reserve_time),
            confirmedPartnerId: data.confirmed_partner_id,
        };
    } catch {
        return null;
    }
}

/**
 * 예약의 ACCEPTED 지원 파트너 목록 (RPC, 소유권 내부 검증).
 * 실패 시 빈 배열.
 */
export async function getReservationApplicants(
    reservationId: string,
): Promise<ReservationApplicant[]> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc(
            "get_reservation_applicants",
            { p_reservation_id: reservationId },
        );
        if (error || !data) return [];

        return (
            data as {
                partner_id: string;
                partner_name: string;
                applied_at: string;
            }[]
        ).map((a) => ({
            partnerId: a.partner_id,
            name: a.partner_name,
            appliedAtLabel: formatAppliedAt(a.applied_at),
        }));
    } catch {
        return [];
    }
}

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { matchingModeOf, type MatchingMode } from "@/lib/direct-assignment";
import type {
    RefundReason,
    RefundStatus,
} from "@/lib/direct-reservation-status";
import { getConsentedPartnerAvatars } from "@/lib/partner-avatars.server";
import { kstStamp, toHhmm, weekdayOf } from "@/lib/format";
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
    /** 처리 방식 (#300) — admin_direct 는 선결제 후 운영자 배정 */
    matchingMode: MatchingMode;
    /** 신규 방식 결제 승인·저장 시각. 없으면 결제 전 */
    paidAt: string | null;
    /** 예약 희망 시각(급한 예약 판정용) — "YYYY-MM-DD" · "HH:mm" */
    useDate: string;
    startTime: string;
};

/** ACCEPTED 지원 파트너 (지원자 선택 카드) */
export type ReservationApplicant = {
    partnerId: string;
    name: string;
    appliedAtLabel: string;
    /** 공개에 동의한 파트너의 프로필 사진 signed URL. 없으면 기본 아이콘 */
    avatarUrl: string | null;
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
    matching_mode?: string | null;
    paid_at?: string | null;
    arrive_time?: string | null;
};

/** "YYYY-MM-DD" → "YYYY.MM.DD (요일)" */
function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = weekdayOf(useDate);
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}.${mm}.${dd} (${weekday})`;
}

/** 지원 시각 라벨 (MM.DD HH:mm · KST) */
function formatAppliedAt(iso: string): string {
    return kstStamp(iso) ?? "";
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
                "id, code, status, plan, hospital_address, use_date, reserve_time, arrive_time, confirmed_partner_id, matching_mode, paid_at",
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
            matchingMode: matchingModeOf(data.matching_mode),
            paidAt: data.paid_at ?? null,
            useDate: data.use_date,
            startTime: toHhmm(data.arrive_time || data.reserve_time),
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

        const list = (
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
        // 공개에 동의한 파트너만 사진을 붙인다 (공개 고지 "사진", 매칭 중).
        const avatars = await getConsentedPartnerAvatars(
            list.map((a) => a.partnerId),
        );
        return list.map((a) => ({
            ...a,
            avatarUrl: avatars.get(a.partnerId) ?? null,
        }));
    } catch {
        return [];
    }
}

/** 배정 전 취소·매칭 실패 환불의 진행 상태 */
export type DirectRefundState = {
    status: RefundStatus;
    reason: RefundReason;
};

/**
 * 신규 방식(#300) 예약의 환불 진행 상태.
 *
 *  reservation_refunds 는 관리자만 읽을 수 있다. 호출부가 고객 세션으로 소유를 확인한
 *  예약 id 만 넘겨야 한다(getCustomerReservation 통과 후). 없거나 실패하면 null.
 *  PG 취소 실패(PG_FAILED)는 그대로 돌려준다 — 화면이 "환불 완료" 로 오표시하지 않게 하는 근거다.
 */
export async function getDirectRefundState(
    reservationId: string,
): Promise<DirectRefundState | null> {
    try {
        const admin = createAdminClient();
        const { data } = await admin
            .from("reservation_refunds")
            .select("status, reason")
            .eq("reservation_id", reservationId)
            .maybeSingle<DirectRefundState>();
        return data ?? null;
    } catch {
        return null;
    }
}

import { createClient } from "@/utils/supabase/server";

/**
 * 운영자 직접 배정 화면 데이터 (#300) — 관리자 세션으로 RPC 를 부른다. service_role 은 쓰지 않는다.
 * 권한(관리자 + MFA + 전체/정산 duty)은 각 RPC 가 DB 에서 검증한다. 실패는 "없음"이 아니라 loadError 로 구분한다.
 */

export type WaitingRow = {
    id: string;
    code: string;
    plan: string;
    use_date: string;
    arrive_time: string;
    reserve_time: string | null;
    duration_minutes: number | null;
    hospital_name: string | null;
    treatment: string | null;
    paid_at: string;
    elapsed_minutes: number;
    start_at: string | null;
    urgent: boolean;
    overdue: boolean;
    payment_status: string;
    notify_status: string | null;
    notify_attempts: number | null;
    notify_last_error: string | null;
    acknowledged_at: string | null;
};

export type ConfirmedDirectRow = {
    id: string;
    code: string;
    plan: string;
    use_date: string;
    arrive_time: string;
    hospital_name: string | null;
    partner_name: string | null;
    service_status: string | null;
    service_started_at: string | null;
    customer_notice_at: string | null;
    partner_accepted_at: string | null;
};

export type RefundIssueRow = {
    reservation_id: string;
    code: string;
    reason: string;
    refund_status: string;
    amount_cash: number;
    attempts: number;
    last_error: string | null;
    requested_at: string;
    match_failed_at: string | null;
    failure_notice_at: string | null;
};

export type DirectEvent = {
    id: number;
    event_type: string;
    actor_role: string | null;
    detail: Record<string, unknown> | null;
    created_at: string;
};

/** admin_get_direct_reservation 이 돌려주는 값. 예약 행은 생년월일·인계 연락처를 뺀 전체 컬럼이다. */
export type DirectDetail = {
    reservation: Record<string, unknown> & {
        id: string;
        code: string;
        status: string;
        plan: string;
        use_date: string;
        arrive_time: string;
        paid_at: string | null;
        confirmed_partner_id: string | null;
        match_failed_at: string | null;
        failure_notice_at: string | null;
        failure_notice_method: string | null;
        failure_notice_memo: string | null;
        partner_accepted_at: string | null;
        partner_accepted_channel: string | null;
        partner_accepted_memo: string | null;
        customer_notice_at: string | null;
        customer_notice_memo: string | null;
        hospital_name: string | null;
        treatment: string | null;
    };
    intake: {
        notify_status: string;
        attempts: number;
        last_error: string | null;
        sent_at: string | null;
        acknowledged_at: string | null;
        acknowledge_memo: string | null;
    } | null;
    refund: {
        status: string;
        reason: string;
        amount_cash: number;
        attempts: number;
        last_error: string | null;
        pg_cancelled_at: string | null;
        requested_at: string;
        completed_at: string | null;
    } | null;
    payment: {
        id: string;
        status: string;
        gross: number;
        discount: number;
        campaign_discount: number;
        paid_at: string | null;
    } | null;
    service: {
        id: string;
        status: string;
        started_at: string | null;
        partner_id: string | null;
    } | null;
    events: DirectEvent[];
    /** 결제 후 경과 분(조회 시점). 결제 전이면 null */
    elapsedMinutes?: number | null;
};

export type PartnerCandidate = {
    partner_id: string;
    name: string;
    conflict: boolean;
};

export async function getWaitingReservations(): Promise<{
    rows: WaitingRow[];
    loadError: boolean;
}> {
    try {
        const { data, error } = await (
            await createClient()
        ).rpc("admin_list_waiting_reservations");
        if (error) return { rows: [], loadError: true };
        return { rows: (data ?? []) as WaitingRow[], loadError: false };
    } catch {
        return { rows: [], loadError: true };
    }
}

export async function getConfirmedDirectReservations(): Promise<{
    rows: ConfirmedDirectRow[];
    loadError: boolean;
}> {
    try {
        const { data, error } = await (
            await createClient()
        ).rpc("admin_list_confirmed_direct_reservations");
        if (error) return { rows: [], loadError: true };
        return {
            rows: (data ?? []) as ConfirmedDirectRow[],
            loadError: false,
        };
    } catch {
        return { rows: [], loadError: true };
    }
}

export async function getRefundIssues(): Promise<{
    rows: RefundIssueRow[];
    loadError: boolean;
}> {
    try {
        const { data, error } = await (
            await createClient()
        ).rpc("admin_list_direct_refund_issues");
        if (error) return { rows: [], loadError: true };
        return { rows: (data ?? []) as RefundIssueRow[], loadError: false };
    } catch {
        return { rows: [], loadError: true };
    }
}

/** 직접 배정 예약 상세. 대상이 아니면(기존 방식 예약 등) null — 호출부가 notFound 로 보낸다. */
export async function getDirectReservation(
    id: string,
): Promise<{ detail: DirectDetail | null; loadError: boolean }> {
    try {
        const { data, error } = await (
            await createClient()
        ).rpc("admin_get_direct_reservation", { p_reservation: id });
        if (error) return { detail: null, loadError: error.code !== "P0002" };
        const detail = (data ?? null) as DirectDetail | null;
        if (detail) {
            // 렌더링 중 Date.now() 를 쓰지 않도록 서버 조회 시점에 한 번 계산한다
            const paid = detail.reservation.paid_at;
            detail.elapsedMinutes = paid
                ? Math.max(
                      0,
                      Math.floor((Date.now() - Date.parse(paid)) / 60000),
                  )
                : null;
        }
        return { detail, loadError: false };
    } catch {
        return { detail: null, loadError: true };
    }
}

export async function getAssignablePartners(
    reservationId: string,
): Promise<PartnerCandidate[]> {
    try {
        const { data, error } = await (
            await createClient()
        ).rpc("admin_list_assignable_partners", {
            p_reservation: reservationId,
        });
        if (error) return [];
        return (data ?? []) as PartnerCandidate[];
    } catch {
        return [];
    }
}

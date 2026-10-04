/**
 * 관리자 홈 데이터 — 서버 전용 (#50).
 *
 * 여기서는 service_role 을 쓰지 않는다. 전부 로그인한 관리자 세션으로 읽으며,
 * 통과 여부는 DB 의 is_admin()(role + status + aal2)이 결정한다.
 * 실제 관리자 업무 화면은 #56 에서 붙인다.
 */

import { createClient } from "@/utils/supabase/server";

export type AdminOverview = {
    name: string;
    /** 자격 심사 대기 건수 */
    pendingQualifications: number;
    /** 지급 대기 정산 건수 */
    pendingSettlements: number;
    /** 예약 총 건수 (개인정보 없는 목록 RPC 기준) */
    reservationCount: number;
    /** 미처리 결제 사고 */
    openPaymentIncidents: number;
    /** 미처리 중 최상 심각도 */
    criticalPaymentIncidents: number;
    paymentIncidentSummaryUnavailable: boolean;
    /** 최근 접속기록 */
    recentAccess: {
        id: number;
        action: string;
        occurredAt: string;
        reason: string | null;
    }[];
};

const EMPTY: AdminOverview = {
    name: "관리자",
    pendingQualifications: 0,
    pendingSettlements: 0,
    reservationCount: 0,
    openPaymentIncidents: 0,
    criticalPaymentIncidents: 0,
    paymentIncidentSummaryUnavailable: false,
    recentAccess: [],
};

export async function getAdminOverview(): Promise<AdminOverview> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return EMPTY;

        const [profile, quals, settlements, reservations, incidents, logs] =
            await Promise.all([
                supabase
                    .from("profiles")
                    .select("name")
                    .eq("id", user.id)
                    .maybeSingle(),
                supabase
                    .from("partner_qualifications")
                    .select("id", { count: "exact", head: true })
                    .eq("status", "PENDING"),
                supabase
                    .from("settlements")
                    .select("id", { count: "exact", head: true })
                    .neq("status", "PAID"),
                supabase.rpc("admin_list_reservations", { p_limit: 200 }),
                supabase.rpc("admin_payment_incident_summary"),
                supabase
                    .from("access_logs")
                    .select("id, action, occurred_at, reason")
                    .order("occurred_at", { ascending: false })
                    .limit(10),
            ]);

        const incidentSummary = (incidents.data?.[0] ?? null) as {
            open_count?: number;
            critical_count?: number;
        } | null;
        const paymentIncidentSummaryUnavailable =
            Boolean(incidents.error) || incidentSummary === null;

        return {
            name: profile.data?.name ?? "관리자",
            pendingQualifications: quals.count ?? 0,
            pendingSettlements: settlements.count ?? 0,
            reservationCount: reservations.data?.length ?? 0,
            openPaymentIncidents: Number(incidentSummary?.open_count ?? 0),
            criticalPaymentIncidents: Number(
                incidentSummary?.critical_count ?? 0,
            ),
            paymentIncidentSummaryUnavailable,
            recentAccess: (logs.data ?? []).map((r) => ({
                id: r.id as number,
                action: r.action as string,
                occurredAt: r.occurred_at as string,
                reason: (r.reason as string | null) ?? null,
            })),
        };
    } catch {
        return { ...EMPTY, paymentIncidentSummaryUnavailable: true };
    }
}

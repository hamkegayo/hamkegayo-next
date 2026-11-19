import { createClient } from "@/utils/supabase/server";

/**
 * 파트너 화면 — 고객 확정 안내 문자 완료 기록 상태 (#300).
 * 신규 방식(admin_direct) 예약에만 의미가 있다. 기존 방식·조회 실패는 null → 패널을 보이지 않는다.
 * 자동 문자 발송은 없다. 파트너가 직접 보낸 뒤 완료만 기록한다.
 */
export type CustomerNoticeView = {
    reservationId: string;
    doneAt: string | null;
    memo: string | null;
    /** 확정(CONFIRMED) 상태일 때만 기록할 수 있다 */
    canRecord: boolean;
};

export async function getCustomerNoticeView(
    serviceId: string,
): Promise<CustomerNoticeView | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;
        const { data, error } = await supabase
            .from("services")
            .select(
                "reservation_id, reservations(status, matching_mode, customer_notice_at, customer_notice_memo, confirmed_partner_id)",
            )
            .eq("id", serviceId)
            .eq("partner_id", user.id)
            .maybeSingle();
        if (error || !data) return null;
        const res = (
            Array.isArray(data.reservations)
                ? data.reservations[0]
                : data.reservations
        ) as {
            status: string;
            matching_mode: string | null;
            customer_notice_at: string | null;
            customer_notice_memo: string | null;
            confirmed_partner_id: string | null;
        } | null;
        if (!res || res.matching_mode !== "admin_direct") return null;
        return {
            reservationId: data.reservation_id as string,
            doneAt: res.customer_notice_at,
            memo: res.customer_notice_memo,
            canRecord:
                res.status === "CONFIRMED" &&
                res.confirmed_partner_id === user.id,
        };
    } catch {
        return null;
    }
}

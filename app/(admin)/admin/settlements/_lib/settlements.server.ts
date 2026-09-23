import { createClient } from "@/utils/supabase/server";

export type AdminSettlement = {
    id: string;
    reservationCode: string;
    useDate: string;
    partnerId: string;
    partnerName: string;
    amount: number;
    fee: number;
    net: number;
    status: "PENDING" | "HOLD" | "APPROVED" | "PAID";
    reason: string | null;
    createdAt: string;
    confirmedAt: string | null;
    paidAt: string | null;
    hasPayoutAccount: boolean;
    paymentReady: boolean;
};

type RawSettlement = {
    id: string;
    reservation_code: string;
    use_date: string;
    partner_id: string;
    partner_name: string;
    amount: number;
    fee: number;
    net: number;
    status: AdminSettlement["status"];
    reason: string | null;
    created_at: string;
    confirmed_at: string | null;
    paid_at: string | null;
    has_payout_account: boolean;
    payment_ready: boolean;
};

export async function getAdminSettlements(filters: {
    from: string | null;
    to: string | null;
    partner: string | null;
    status: AdminSettlement["status"] | null;
}) {
    const supabase = await createClient();
    const [{ data: allowed }, settlements, partners] = await Promise.all([
        supabase.rpc("can_manage_settlements"),
        supabase.rpc("admin_list_settlements", {
            p_from: filters.from,
            p_to: filters.to,
            p_partner: filters.partner,
            p_status: filters.status,
            p_limit: 500,
        }),
        supabase.rpc("admin_list_payout_accounts"),
    ]);
    if (allowed !== true)
        return { allowed: false as const, rows: [], partners: [] };
    if (settlements.error) throw settlements.error;

    return {
        allowed: true as const,
        rows: ((settlements.data ?? []) as RawSettlement[]).map((row) => ({
            id: row.id,
            reservationCode: row.reservation_code,
            useDate: row.use_date,
            partnerId: row.partner_id,
            partnerName: row.partner_name,
            amount: row.amount,
            fee: row.fee,
            net: row.net,
            status: row.status,
            reason: row.reason,
            createdAt: row.created_at,
            confirmedAt: row.confirmed_at,
            paidAt: row.paid_at,
            hasPayoutAccount: row.has_payout_account,
            paymentReady: row.payment_ready,
        })),
        partners: (
            (partners.data ?? []) as {
                partner_id: string;
                partner_name: string;
            }[]
        ).map((row) => ({
            id: row.partner_id as string,
            name: row.partner_name as string,
        })),
    };
}

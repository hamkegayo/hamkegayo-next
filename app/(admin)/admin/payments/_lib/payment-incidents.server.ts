import { createClient } from "@/utils/supabase/server";

export type PaymentIncidentHistory = {
    id: number;
    action: "STATUS_CHANGED" | "CUSTOMER_CONTACT";
    fromStatus: string | null;
    toStatus: string | null;
    contactMethod: string | null;
    note: string;
    createdAt: string;
};

export type PaymentIncidentView = {
    id: string;
    paymentId: string | null;
    reservationId: string | null;
    orderId: string | null;
    kind: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    amount: number | null;
    detail: Record<string, unknown> | null;
    memo: string | null;
    createdAt: string;
    updatedAt: string;
    history: PaymentIncidentHistory[];
};

type IncidentRow = {
    id: string;
    payment_id: string | null;
    reservation_id: string | null;
    order_id: string | null;
    kind: string;
    severity: PaymentIncidentView["severity"];
    status: PaymentIncidentView["status"];
    amount: number | null;
    detail: Record<string, unknown> | null;
    memo: string | null;
    created_at: string;
    updated_at: string;
    history: PaymentIncidentHistory[] | null;
};

export type PaymentIncidentListResult = {
    incidents: PaymentIncidentView[];
    loadError: boolean;
};

export async function getAdminPaymentIncidents(): Promise<PaymentIncidentListResult> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc(
            "admin_list_payment_incidents",
            { p_status: null },
        );
        if (error || !data) return { incidents: [], loadError: true };

        return {
            incidents: (data as IncidentRow[]).map((row) => ({
                id: row.id,
                paymentId: row.payment_id,
                reservationId: row.reservation_id,
                orderId: row.order_id,
                kind: row.kind,
                severity: row.severity,
                status: row.status,
                amount: row.amount,
                detail: row.detail,
                memo: row.memo,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                history: row.history ?? [],
            })),
            loadError: false,
        };
    } catch {
        return { incidents: [], loadError: true };
    }
}

export type AdminReservationSummary = {
    id: string;
    code: string;
    status: string;
    patientName: string;
    patientPhone: string;
    guardianName: string;
    guardianPhone: string;
    hospitalName: string;
    hospitalAddress: string;
    useDate: string;
    arriveTime: string;
};

export async function getAdminReservationForIncident(
    reservationId: string,
    incidentId: string,
): Promise<AdminReservationSummary | null> {
    if (!incidentId) return null;

    try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc(
            "admin_get_payment_incident_reservation",
            { p_incident_id: incidentId },
        );
        if (error || !data) return null;

        const row = data as Record<string, unknown>;
        if (String(row.id ?? "") !== reservationId) return null;
        return {
            id: String(row.id ?? ""),
            code: String(row.code ?? ""),
            status: String(row.status ?? ""),
            patientName: String(row.patient_name ?? ""),
            patientPhone: String(row.patient_phone ?? ""),
            guardianName: String(row.guardian_name ?? ""),
            guardianPhone: String(row.guardian_phone ?? ""),
            hospitalName: String(row.hospital_name ?? ""),
            hospitalAddress: String(row.hospital_address ?? ""),
            useDate: String(row.use_date ?? ""),
            arriveTime: String(row.arrive_time ?? ""),
        };
    } catch {
        return null;
    }
}

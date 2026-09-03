import { createClient } from "@/utils/supabase/server";
import { planDisplay, type PlanCode } from "@/lib/reservation";
import type { Settlement, SettlementSummary } from "./settlement";

type ServiceRow = {
    id: string;
    amount: number;
    fee: number;
    net: number;
    status: "PENDING" | "PAID";
    settled_at: string | null;
    services: {
        reservations: {
            plan: string;
            hospital_address: string;
            use_date: string;
        } | null;
    } | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    return `${y}.${String(mo).padStart(2, "0")}.${String(d).padStart(2, "0")} (${weekday})`;
}

/** ISO → "YYYY.MM.DD" */
function formatSettled(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 정산 ID 표시용 (ST-YYYYMM-앞4자리) */
function displayId(id: string, useDate: string): string {
    const [y, mo] = useDate.split("-");
    const ym = y && mo ? `${y.slice(2)}${mo}` : "0000";
    return `ST-${ym}-${id.slice(0, 4).toUpperCase()}`;
}

function toView(r: ServiceRow): Settlement {
    const res = r.services?.reservations ?? null;
    const planCode: PlanCode = res?.plan === "plus" ? "plus" : "basic";
    const useDate = res?.use_date ?? "";
    return {
        id: displayId(r.id, useDate),
        serviceDate: useDate ? formatDate(useDate) : "",
        hospital: res?.hospital_address ?? "",
        plan: planDisplay(planCode),
        // 파트너에게 보여줄 기본 금액은 실지급액이다.
        amount: r.net,
        grossAmount: r.amount,
        fee: r.fee,
        status: r.status === "PAID" ? "paid" : "pending",
        settledDate: formatSettled(r.settled_at),
    };
}

/** 로그인 파트너의 정산 목록 + 요약 */
export async function getPartnerSettlements(): Promise<{
    settlements: Settlement[];
    summary: SettlementSummary;
}> {
    const empty: SettlementSummary = {
        totalAmount: 0,
        serviceCount: 0,
        paidCount: 0,
        pendingCount: 0,
    };
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { settlements: [], summary: empty };

        const { data, error } = await supabase
            .from("settlements")
            .select(
                "id, amount, fee, net, status, settled_at, services!inner(reservations!inner(plan, hospital_address, use_date))",
            )
            .eq("partner_id", user.id)
            .order("created_at", { ascending: false })
            .returns<ServiceRow[]>();

        if (error || !data) return { settlements: [], summary: empty };

        const settlements = data.map(toView);
        const summary: SettlementSummary = {
            totalAmount: data.reduce((s, r) => s + r.net, 0),
            serviceCount: data.length,
            paidCount: data.filter((r) => r.status === "PAID").length,
            pendingCount: data.filter((r) => r.status === "PENDING").length,
        };

        return { settlements, summary };
    } catch {
        return { settlements: [], summary: empty };
    }
}

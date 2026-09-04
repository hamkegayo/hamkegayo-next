import { createClient } from "@/utils/supabase/server";
import { planDisplay, type PlanCode } from "@/lib/reservation";
import type { Settlement, SettlementSummary } from "./settlement";

/**
 * 정산 이력은 partner_list_settlements() RPC 로 읽는다 — #66 · #67
 *
 * 서비스 종료 후 24시간이 지나면 파트너의 예약 접근이 차단되므로(처리방침 제9조 ④),
 * settlements → services → reservations 조인이 끊겨 목록이 비어버린다.
 * RPC 는 이용자 개인정보 없이 예약번호 · 일자 · 금액만 돌려준다.
 */
type SettlementRow = {
    id: string;
    code: string;
    use_date: string;
    plan: string;
    amount: number;
    fee: number;
    net: number;
    status: "PENDING" | "PAID";
    settled_at: string | null;
    created_at: string;
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

function toView(r: SettlementRow): Settlement {
    const planCode: PlanCode = r.plan === "plus" ? "plus" : "basic";
    const useDate = r.use_date ?? "";
    return {
        id: displayId(r.id, useDate),
        serviceDate: useDate ? formatDate(useDate) : "",
        // 병원명·주소는 종료 후 접근이 차단되므로 예약번호로 대신한다 (제9조 ④)
        hospital: r.code,
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

        const { data: raw, error } = await supabase.rpc(
            "partner_list_settlements",
        );

        if (error || !raw) return { settlements: [], summary: empty };
        const data = raw as SettlementRow[];

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

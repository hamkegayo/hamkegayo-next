/**
 * 포인트 조회 — 서버 전용 (#49).
 *  - 원장은 public.points. 잔액은 행 합계이고, 만료된 적립분은 제외한다.
 *  - RLS(points_select_own)로 본인 행만 읽히므로 합계도 본인 것만 나온다.
 *  - 적립·차감(쓰기)은 service_role 전용이라 여기서는 다루지 않는다.
 */

import { createClient } from "@/utils/supabase/server";

/** 소멸 예정으로 안내할 기간(일) */
const EXPIRING_SOON_DAYS = 30;

const REASON_LABEL: Record<string, string> = {
    EARN_PAYMENT: "결제 적립",
    COMPENSATION: "보상 지급",
    USE: "결제 사용",
    USE_CANCEL: "사용 취소",
    EXPIRE: "기간 만료",
};

export type PointEntry = {
    id: string;
    /** 적립 양수 / 사용·만료 음수 */
    amount: number;
    label: string;
    dateLabel: string;
    expiresLabel: string | null;
};

export type PointSummary = {
    /** 사용 가능한 포인트 */
    balance: number;
    /** 소멸 예정 포인트 (30일 이내 만료) */
    expiring: number;
    entries: PointEntry[];
};

type Row = {
    id: string;
    amount: number;
    reason: string;
    expires_at: string | null;
    created_at: string;
};

const EMPTY: PointSummary = { balance: 0, expiring: 0, entries: [] };

/** ISO → "YYYY.MM.DD" */
function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 로그인 사용자의 포인트 요약 + 내역. 비로그인/조회 실패 시 0. */
export async function getMyPoints(): Promise<PointSummary> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return EMPTY;

        const { data, error } = await supabase
            .from("points")
            .select("id, amount, reason, expires_at, created_at")
            .order("created_at", { ascending: false })
            .returns<Row[]>();

        if (error || !data) return EMPTY;

        const now = Date.now();
        const soon = now + EXPIRING_SOON_DAYS * 86_400_000;

        // 만료된 적립분은 잔액에서 제외한다 (point_balance() 와 동일한 규칙)
        const live = data.filter(
            (r) => !r.expires_at || new Date(r.expires_at).getTime() > now,
        );

        const balance = live.reduce((sum, r) => sum + r.amount, 0);

        const expiring = live
            .filter(
                (r) =>
                    r.amount > 0 &&
                    r.expires_at &&
                    new Date(r.expires_at).getTime() <= soon,
            )
            .reduce((sum, r) => sum + r.amount, 0);

        return {
            balance,
            expiring,
            entries: data.map((r) => ({
                id: r.id,
                amount: r.amount,
                label: REASON_LABEL[r.reason] ?? r.reason,
                dateLabel: formatDate(r.created_at),
                expiresLabel: r.expires_at
                    ? `${formatDate(r.expires_at)} 소멸`
                    : null,
            })),
        };
    } catch {
        return EMPTY;
    }
}

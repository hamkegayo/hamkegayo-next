import { createClient } from "@/utils/supabase/server";
import { payUnpaidCharge } from "../_actions/unpaid";

/**
 * 미결제 추가결제 안내 (#75) — 약관 제22조.
 *
 *  기한이 지난 건은 링크가 죽어 있어 여기가 유일한 결제 경로다.
 *  기한 안이라도 링크를 잃어버린 사람이 있어 함께 보여 준다.
 */
type Row = {
    payment_id: string;
    amount: number;
    code: string;
    use_date: string;
    charge_reason: string | null;
    expires_at: string | null;
    overdue: boolean;
};

const REASON_LABEL: Record<string, string> = {
    EXTENSION: "이용시간 연장",
    NO_SHOW: "이용자 미도착",
};

export async function UnpaidCharges() {
    const supabase = await createClient();
    const { data } = await supabase.rpc("list_my_unpaid_charges");
    const rows = (data as Row[] | null) ?? [];

    if (rows.length === 0) return null;

    const hasOverdue = rows.some((r) => r.overdue);

    return (
        <section className="border-destructive/30 bg-destructive/5 mt-8 rounded-2xl border p-6">
            <h2 className="text-foreground text-lg font-bold">
                결제하지 않은 금액이 있어요
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {hasOverdue
                    ? "결제 기한이 지난 건이 있습니다. 결제를 완료하시기 전에는 새 예약을 신청하실 수 없어요."
                    : "서비스 이용 후 확정된 추가 요금입니다."}
            </p>

            <ul className="mt-5 space-y-3">
                {rows.map((r) => (
                    <li
                        key={r.payment_id}
                        className="border-border bg-background flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                    >
                        <div className="text-sm">
                            <p className="text-foreground font-bold">
                                {r.amount.toLocaleString()}원
                                {r.overdue && (
                                    <span className="text-destructive ml-2 text-xs font-semibold">
                                        기한 경과
                                    </span>
                                )}
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                                {r.use_date} · 예약 {r.code} ·{" "}
                                {REASON_LABEL[r.charge_reason ?? ""] ??
                                    "추가 이용요금"}
                            </p>
                        </div>

                        {/*
                          서버 액션이 토큰을 새로 발급해 결제 페이지로 보낸다.
                          기한이 지나 링크가 죽었어도 여기서는 결제할 수 있다.
                        */}
                        <form action={payUnpaidCharge.bind(null, r.payment_id)}>
                            <button
                                type="submit"
                                className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-4 py-2 text-sm font-bold transition-colors"
                            >
                                결제하기
                            </button>
                        </form>
                    </li>
                ))}
            </ul>
        </section>
    );
}

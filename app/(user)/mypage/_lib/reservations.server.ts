import { createClient } from "@/utils/supabase/server";
import {
    PLAN_INFO,
    RESERVATION_STATUS_LABEL,
    type PlanCode,
    type ReservationStatus,
} from "@/lib/reservation";

/** 현재 진행 중(매칭/확정) 예약 요약 */
export type CurrentReservationView = {
    id: string;
    hospital: string;
    datetimeLabel: string;
    planLabel: string;
    status: ReservationStatus;
    statusLabel: string;
    /** 진행 단계 인디케이터: 매칭 대기중 → 파트너 확정 (서비스 진행/완료는 후속 슬라이스) */
    step: "matching" | "confirmed";
};

/** 최근 예약 내역(완료/취소) */
export type RecentReservationView = {
    id: string;
    hospital: string;
    datetimeLabel: string;
    planLabel: string;
    status: ReservationStatus;
    statusLabel: string;
};

type Row = {
    id: string;
    status: ReservationStatus;
    plan: string;
    hospital_address: string;
    use_date: string;
    reserve_time: string;
    created_at: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "YYYY-MM-DD" + "HH:mm" → "YYYY.MM.DD (요일) 오전/오후 h:mm" */
function formatDateTime(useDate: string, reserveTime: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    const t = /^(\d{1,2}):(\d{2})/.exec(reserveTime.trim());
    if (!y || !mo || !d || !t) return `${useDate} ${reserveTime}`;

    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");

    const h24 = Number(t[1]);
    const meridiem = h24 < 12 ? "오전" : "오후";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

    return `${y}.${mm}.${dd} (${weekday}) ${meridiem} ${h12}:${t[2]}`;
}

function planLabel(plan: string): string {
    const code: PlanCode = plan === "plus" ? "plus" : "basic";
    return PLAN_INFO[code].label;
}

/**
 * 로그인 고객의 예약현황.
 *  - current: 진행 중(MATCHING/CONFIRMED) 최신 1건
 *  - recent: 완료/취소(COMPLETED/CANCELLED) 최신순
 * 비로그인/조회 실패 시 빈 값.
 */
export async function getMyReservations(): Promise<{
    current: CurrentReservationView | null;
    recent: RecentReservationView[];
}> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { current: null, recent: [] };

        const { data, error } = await supabase
            .from("reservations")
            .select(
                "id, status, plan, hospital_address, use_date, reserve_time, created_at",
            )
            .eq("customer_id", user.id)
            .order("created_at", { ascending: false })
            .returns<Row[]>();

        if (error || !data) return { current: null, recent: [] };

        const activeRow = data.find(
            (r) => r.status === "MATCHING" || r.status === "CONFIRMED",
        );

        const current: CurrentReservationView | null = activeRow
            ? {
                  id: activeRow.id,
                  hospital: activeRow.hospital_address,
                  datetimeLabel: formatDateTime(
                      activeRow.use_date,
                      activeRow.reserve_time,
                  ),
                  planLabel: planLabel(activeRow.plan),
                  status: activeRow.status,
                  statusLabel:
                      RESERVATION_STATUS_LABEL[activeRow.status] ??
                      activeRow.status,
                  step:
                      activeRow.status === "CONFIRMED"
                          ? "confirmed"
                          : "matching",
              }
            : null;

        const recent: RecentReservationView[] = data
            .filter((r) => r.status === "COMPLETED" || r.status === "CANCELLED")
            .slice(0, 10)
            .map((r) => ({
                id: r.id,
                hospital: r.hospital_address,
                datetimeLabel: formatDateTime(r.use_date, r.reserve_time),
                planLabel: planLabel(r.plan),
                status: r.status,
                statusLabel: RESERVATION_STATUS_LABEL[r.status] ?? r.status,
            }));

        return { current, recent };
    } catch {
        return { current: null, recent: [] };
    }
}

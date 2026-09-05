/**
 * 파트너 수락 대기(매칭 전) 조회 — #66 · #67
 *
 * 개인정보처리방침 제5조 ② 단계 1 이 매칭 전에 제공할 항목을 열거하고 있어,
 * 여기서는 `reservations` 를 직접 읽지 않고 단계 1 전용 RPC 만 호출한다.
 * RLS 도 매칭 전 직접 조회를 막고 있어(20260708000022) 직접 select 하면 빈 결과가 온다.
 *
 * 매칭 전에 나가지 않는 것 — 제5조 ③
 *   이용자 성명 · 연락처 · 상세 출발지 주소 · 병원 주소 · 진료·검사 · 진료 목적 · 요청사항
 * 매칭 전에 나가는 것 — 제5조 ② 단계 1 · 제5조 ④
 *   일자 · 도착 희망시간 · 진료 예약시간 · 예상 소요시간 · 서비스 종류
 *   · 병원명 · 지역(동 단위) · 거동상태 · 인지상태
 */

import { createClient } from "@/utils/supabase/server";
import { runExpirySweep } from "@/lib/expire-matchings";
import { toHhmm } from "@/lib/format";
import { planDisplay, type PlanCode } from "@/lib/reservation";
import { calcPartnerPayout, calcPrepayment } from "@/lib/pricing";

/** 단계 1 RPC 가 돌려주는 행 */
type OpenRow = {
    id: string;
    code: string;
    plan: string;
    use_date: string;
    arrive_time: string;
    reserve_time: string;
    duration: string;
    duration_minutes: number | null;
    hospital_name: string | null;
    depart_region: string | null;
    hospital_region: string | null;
    mobility_status: string | null;
    cognitive_status: string | null;
    surcharge_rate: number | string | null;
    applied: boolean;
};

/** 수락 대기 목록(파트너 화면)에 표시할 항목 */
export type PartnerMatchingItem = {
    id: string;
    plan: "Basic" | "Plus";
    /** 병원명. 매칭 전에는 주소를 주지 않는다 (제5조 ③) */
    hospital: string;
    /** 목록 부제 — 출발지 지역(동 단위) */
    type: string;
    /** "오늘" / "내일" / "9월 5일 (토)" */
    dateLabel: string;
    /** "15:00" */
    timeLabel: string;
    /** 예상 소요시간(원본 duration 문자열) */
    duration: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** basic/plus → Basic/Plus (공용 헬퍼 래핑, 알 수 없는 값은 Basic) */
function planLabel(plan: string): "Basic" | "Plus" {
    return planDisplay(plan === "plus" ? "plus" : "basic");
}

/** 병원명이 아직 없는 구 데이터를 위한 표시값 */
function hospitalLabel(row: OpenRow): string {
    return row.hospital_name?.trim() || row.hospital_region || "병원 정보 없음";
}

/** 출발지 → 병원 지역 요약 */
function regionLabel(row: OpenRow): string {
    const from = row.depart_region ?? "";
    const to = row.hospital_region ?? "";
    if (from && to) return `${from} → ${to}`;
    return from || to || "지역 정보 없음";
}

/**
 * use_date(YYYY-MM-DD) → "오늘" / "내일" / "9월 5일 (토)".
 * 오늘/내일은 서버 로컬 날짜 기준으로 판별한다.
 */
function formatDateLabel(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;

    const target = new Date(y, mo - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round(
        (target.getTime() - today.getTime()) / 86_400_000,
    );

    if (diffDays === 0) return "오늘";
    if (diffDays === 1) return "내일";
    return `${mo}월 ${d}일 (${WEEKDAYS[target.getDay()] ?? ""})`;
}

/** 단계 1 목록을 가져와 아직 지원하지 않은 건만 남긴다 */
async function fetchOpenRows(): Promise<OpenRow[]> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    await runExpirySweep();

    const { data, error } = await supabase.rpc(
        "partner_list_open_reservations",
        { p_limit: 200 },
    );

    if (error || !data) return [];
    return (data as OpenRow[]).filter((r) => !r.applied);
}

/**
 * 로그인한 파트너의 수락 대기 건수.
 * 목록과 동일한 제외 규칙(이미 지원한 예약 제외)을 적용한다.
 */
export async function getPartnerMatchingCount(): Promise<number> {
    try {
        return (await fetchOpenRows()).length;
    } catch {
        return 0;
    }
}

/**
 * 로그인한 파트너에게 내려줄 수락 대기 예약 목록.
 * 비로그인/비파트너/조회 실패 시 빈 배열을 반환한다(화면은 빈 상태로 처리).
 */
export async function getPartnerMatchingRequests(): Promise<
    PartnerMatchingItem[]
> {
    try {
        const rows = await fetchOpenRows();
        return rows.map((r) => ({
            id: r.id,
            plan: planLabel(r.plan),
            hospital: hospitalLabel(r),
            type: regionLabel(r),
            dateLabel: formatDateLabel(r.use_date),
            timeLabel: toHhmm(r.reserve_time),
            duration: r.duration,
        }));
    } catch {
        return [];
    }
}

// =============================================================
// 상세 조회 (수락/거절 화면)
// =============================================================

export type PartnerRequestDetail = {
    id: string;
    code: string;
    plan: "Basic" | "Plus";
    /** "베이직 서비스" / "플러스 서비스" */
    serviceType: string;
    /** 수락/거절 가능 여부 = 아직 미지원 */
    canAct: boolean;
    /** 병원명 (주소 아님 — 제5조 ③) */
    hospital: string;
    hospitalDate: string;
    hospitalTime: string;
    arriveDate: string;
    arriveTime: string;
    estDuration: string;
    /** 예상 지급액(원) — 선결제액에서 플랫폼 수수료를 뺀 값 */
    amount: number;
    /** 주말·공휴일 30% 할증 적용 여부 */
    surcharged: boolean;
    /** 출발지 지역(동 단위). 상세주소는 확정 후에 제공된다 */
    departRegion: string;
    /** 병원 지역(동 단위) */
    hospitalRegion: string;
    /** 수행 가능 여부 판단용 최소 건강정보 — 제5조 ④ */
    condition: {
        mobility: string;
        cognitive: string;
    };
};

/** "YYYY-MM-DD" → "YYYY.MM.DD (요일)" */
function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}.${mm}.${dd} (${weekday})`;
}

/**
 * 상세(수락/거절) 화면용 단건 조회 — 단계 1 항목만.
 *
 * 거절했거나 미선택된 파트너는 RPC 가 거절한다(제9조 ④ "수락하지 않은 파트너는 즉시 차단").
 * 조회 실패/권한 없음/비로그인 시 null 을 반환(화면은 "찾을 수 없음" 처리).
 */
export async function getPartnerRequestDetail(
    reservationId: string,
): Promise<PartnerRequestDetail | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase.rpc(
            "partner_get_open_reservation",
            { p_id: reservationId },
        );

        const row = (data as OpenRow[] | null)?.[0];
        if (error || !row) return null;

        const planCode: PlanCode = row.plan === "plus" ? "plus" : "basic";
        const plan = planDisplay(planCode);

        // 예상 지급액은 이용자의 결제 금액이 아니라 파트너 보수다(제5조 ⑤ 와 무관).
        // 요금 규칙으로 그 자리에서 산정한다.
        const surcharged = Number(row.surcharge_rate ?? 0) > 0;
        const prepaid = calcPrepayment(
            planCode,
            row.duration_minutes ?? 120,
            surcharged,
        ).amount;

        return {
            id: row.id,
            code: row.code,
            plan,
            serviceType: plan === "Plus" ? "플러스 서비스" : "베이직 서비스",
            canAct: !row.applied,
            hospital: hospitalLabel(row),
            hospitalDate: formatDate(row.use_date),
            hospitalTime: toHhmm(row.reserve_time),
            arriveDate: formatDate(row.use_date),
            arriveTime: toHhmm(row.arrive_time),
            estDuration: row.duration,
            amount: calcPartnerPayout(planCode, prepaid).net,
            surcharged,
            departRegion: row.depart_region ?? "지역 정보 없음",
            hospitalRegion: row.hospital_region ?? "지역 정보 없음",
            condition: {
                mobility: row.mobility_status?.trim() || "정보 없음",
                cognitive: row.cognitive_status?.trim() || "정보 없음",
            },
        };
    } catch {
        return null;
    }
}

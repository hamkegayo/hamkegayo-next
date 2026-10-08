/**
 * 파트너 수락 대기(매칭 전) 조회 — #66 · #67
 *
 * 개인정보처리방침 제5조 ② 단계 1 이 매칭 전에 제공할 항목을 열거하고 있어,
 * 여기서는 `reservations` 를 직접 읽지 않고 단계 1 전용 RPC 만 호출한다.
 * RLS 도 매칭 전 직접 조회를 막고 있어(20260708000022) 직접 select 하면 빈 결과가 온다.
 *
 * 매칭 전에 나가지 않는 것 — 제5조 ③
 *   이용자 성명 · 연락처 · 상세 출발지 주소 · 병원 주소 · 진료·검사 · 진료 목적 · 요청사항
 * 매칭 전에 나가는 것 — 제5조 ② [단계 1]·④, 제9조 ② (정책상 최소 건강정보는 별도 동의 필요)
 * 별도 동의 수집·접근 게이트는 이 조회 함수에 구현되어 있지 않다.
 *   일자 · 도착 희망시간 · 진료 예약시간 · 예상 소요시간 · 서비스 종류
 *   · 병원명 · 지역(동 단위) · 거동상태 · 인지상태
 */

import { createClient } from "@/utils/supabase/server";
import { runExpirySweep } from "@/lib/expire-matchings";
import { formatUseDate, kstToday, toHhmm, weekdayOf } from "@/lib/format";
import { planDisplay, type PlanCode } from "@/lib/reservation";
import { calcPartnerPayout, calcPrepayment } from "@/lib/pricing";
import { isPublicHoliday } from "@/lib/holidays";
import {
    MATCH_LABEL,
    matchRequest,
    type ServerMatch,
} from "@/lib/partner-matching";
import { getMyPartnerActivity } from "./activity.server";

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
    // 매뉴얼 1단계가 수락 전 확인을 요구하는 항목 (#77).
    // 개인정보가 아니라 수행 조건이라 단계 1 에 포함된다(처리방침 제5조 ② "이동 관련 선택사항").
    transport_to: string | null;
    transport_home: string | null;
    end_method: string | null;
    /** 대체 인계자 등록 여부만. 성명·연락처는 확정 후에 온다 */
    has_backup_handover: boolean | null;
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
    /**
     * 내 활동 정보와 맞는지 (#226). 활동 정보가 없으면 null.
     * matched 는 설정한 필수 조건이 모두 맞을 때, hits 는 맞은 항목 이름.
     */
    match: { matched: boolean; hits: string[] } | null;
};

export type PartnerMatchingView = {
    items: PartnerMatchingItem[];
    /** 활동 정보를 하나라도 설정했는지 — 아니면 "설정하면 먼저 보여 드려요" 안내 */
    activitySet: boolean;
    /** 판정을 실제로 했는지. 판정 조회가 실패하면 false — 필터를 끄고 전체를 보여 준다 (#233 리뷰) */
    matchingAvailable: boolean;
};

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
    // 오늘/내일 판정은 KST 기준이다. 서버(UTC)의 오늘을 쓰면 KST 09시
    // 이전에 하루가 밀린다.
    const [ty, tmo, td] = kstToday()
        .split("-")
        .map((n) => Number(n));
    const today = new Date(ty, tmo - 1, td);
    const diffDays = Math.round(
        (target.getTime() - today.getTime()) / 86_400_000,
    );

    if (diffDays === 0) return "오늘";
    if (diffDays === 1) return "내일";
    return `${mo}월 ${d}일 (${weekdayOf(useDate)})`;
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
 * 로그인한 파트너에게 내려줄 수락 대기 예약 목록과 "내 조건에 맞음" 판정 (#226).
 *
 * 맞는 요청을 위로 올리고(맞음 > 선호 병원 > 맞은 항목 수), 맞지 않는 요청도 숨기지 않는다.
 * 활동 정보가 없거나 판정 조회가 실패하면 지금처럼 이용일 순 그대로다 — 매칭은 보조 정보라
 * 실패해도 요청 목록 자체는 보여야 한다.
 * 비로그인/비파트너/조회 실패 시 빈 배열을 반환한다(화면은 빈 상태로 처리).
 */
export async function getPartnerMatchingView(): Promise<PartnerMatchingView> {
    try {
        const rows = await fetchOpenRows();
        const base = rows.map((r) => ({
            id: r.id,
            plan: planLabel(r.plan),
            hospital: hospitalLabel(r),
            type: regionLabel(r),
            dateLabel: formatDateLabel(r.use_date),
            timeLabel: toHhmm(r.reserve_time),
            duration: r.duration,
            match: null,
        })) satisfies PartnerMatchingItem[];

        const load = await getMyPartnerActivity();
        const activity = load.ok ? load.activity : null;
        const activitySet =
            activity !== null &&
            (activity.regions.length > 0 ||
                activity.transports.length > 0 ||
                activity.mobility.length > 0 ||
                activity.hospitals.length > 0 ||
                Object.values(activity.times).some((t) => t !== null));
        if (!activitySet || rows.length === 0)
            return { items: base, activitySet, matchingAvailable: true };

        const supabase = await createClient();
        const { data: serverRows, error } = await supabase.rpc(
            "partner_open_reservation_matches",
            { p_ids: rows.map((r) => r.id) },
        );
        if (error)
            return { items: base, activitySet, matchingAvailable: false };
        const server = new Map<string, ServerMatch>(
            (
                serverRows as {
                    reservation_id: string;
                    region_match: boolean | null;
                    transport_match: boolean | null;
                }[]
            ).map((m) => [
                m.reservation_id,
                { region: m.region_match, transport: m.transport_match },
            ]),
        );

        const dates = [...new Set(rows.map((r) => r.use_date))];
        const holidays = new Set(
            (
                await Promise.all(
                    dates.map(async (d) =>
                        (await isPublicHoliday(d)) ? d : null,
                    ),
                )
            ).filter(Boolean),
        );

        const scored = rows.map((r, i) => {
            const m = matchRequest(
                {
                    useDate: r.use_date,
                    arriveTime: r.arrive_time,
                    durationMinutes: r.duration_minutes,
                    mobilityStatus: r.mobility_status,
                    hospitalName: r.hospital_name,
                    isHoliday: holidays.has(r.use_date),
                },
                activity,
                server.get(r.id) ?? { region: null, transport: null },
            );
            return {
                item: {
                    ...base[i],
                    match: {
                        matched: m.matched,
                        hits: m.hits.map((k) => MATCH_LABEL[k]),
                    },
                },
                score: m.score,
                order: i,
            };
        });
        scored.sort((a, b) => b.score - a.score || a.order - b.order);
        return {
            items: scored.map((s) => s.item),
            activitySet,
            matchingAvailable: true,
        };
    } catch {
        return { items: [], activitySet: false, matchingAvailable: false };
    }
}

/** 수락 대기 목록 (홈 화면 등). 맞는 요청이 위에 온다. */
export async function getPartnerMatchingRequests(): Promise<
    PartnerMatchingItem[]
> {
    return (await getPartnerMatchingView()).items;
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
    /**
     * 수행 조건 — 매뉴얼 1단계·PART 4 확인표가 수락 전 확인을 요구한다.
     * 값이 없으면 "정보 없음" 이 아니라 **수락하지 말라는 신호**다(대응카드 01).
     */
    plan_conditions: {
        transportTo: string | null;
        transportHome: string | null;
        endMethod: string | null;
        hasBackupHandover: boolean;
    };
    /** 수락 검토용 최소 건강정보 — 처리방침 제5조 ② [단계 1]·④ */
    condition: {
        mobility: string;
        cognitive: string;
    };
};

/** "YYYY-MM-DD" → "YYYY.MM.DD (요일)" */
function formatDate(useDate: string): string {
    return formatUseDate(useDate);
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
            Number(row.surcharge_rate ?? 0),
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
            plan_conditions: {
                transportTo: row.transport_to,
                transportHome: row.transport_home,
                endMethod: row.end_method,
                hasBackupHandover: row.has_backup_handover === true,
            },
            condition: {
                mobility: row.mobility_status?.trim() || "정보 없음",
                cognitive: row.cognitive_status?.trim() || "정보 없음",
            },
        };
    } catch {
        return null;
    }
}

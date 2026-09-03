/**
 * 예약 도메인 공용 단일 소스 (서버/클라 공용).
 *  - plan 표기·가격, 예약번호(code) 포맷, 상태값/라벨을 여기 한 곳에서 관리.
 *  - 목업마다 제각각이던 값을 DB 기준으로 통일하기 위한 기준 모듈(#20).
 *  - DB 정본: reservation_status enum(MATCHING/CONFIRMED/CANCELLED/COMPLETED),
 *    plan check('basic'|'plus'). 이 모듈의 값은 DB 정본과 일치해야 한다.
 */

// =============================================================
// plan (basic/plus) · 가격
// =============================================================

/** DB plan 값 (check 제약과 동일) */
export type PlanCode = "basic" | "plus";

/**
 * 플랜 표시 라벨 / 단가 / 수수료율.
 *  - price 는 **시간당** 기본요금이다 (약관 제11조 ① — Basic 20,000 / Plus 25,000).
 *  - feeRate 는 최종 결제 총액 기준 플랫폼 수수료율. 원천징수는 하지 않는다(파트너 프리랜서).
 *  - 실제 금액 계산은 lib/pricing.ts 가 담당한다.
 */
export const PLAN_INFO: Record<
    PlanCode,
    {
        short: string;
        label: string;
        badge: string;
        /** 시간당 기본요금(원) */
        price: number;
        /** 30분 단가(원) */
        halfHourPrice: number;
        /** 15분 단가(원) — 연장·부분 청구 단위 */
        quarterPrice: number;
        /** 플랫폼 수수료율 (최종 결제 총액 기준) */
        feeRate: number;
    }
> = {
    basic: {
        short: "베이직",
        label: "베이직 서비스 (병원에서 만남 + 진료 동행)",
        badge: "[베이직] 병원 동행 서비스",
        price: 20000,
        halfHourPrice: 10000,
        quarterPrice: 5000,
        feeRate: 0.2,
    },
    plus: {
        short: "플러스",
        label: "플러스 서비스 (자택 픽업 + 병원 동행)",
        badge: "[플러스] 병원 동행 서비스",
        price: 25000,
        halfHourPrice: 12500,
        quarterPrice: 6250,
        feeRate: 0.24,
    },
};

/** plan 시간당 기본요금(원) */
export function planPrice(plan: PlanCode): number {
    return PLAN_INFO[plan].price;
}

/** DB plan(basic/plus) → 화면 배지 표기(Basic/Plus) */
export function planDisplay(plan: PlanCode): "Basic" | "Plus" {
    return plan === "plus" ? "Plus" : "Basic";
}

// =============================================================
// 예약번호(code) 포맷 — DB `reservations.code` 기준
//   R{yyyymmdd}-{4자리}  예) R20260726-1234
// =============================================================

export const RESERVATION_CODE_RE = /^R\d{8}-\d{4}$/;

/** 예약번호 형식 여부 */
export function isReservationCode(code: string): boolean {
    return RESERVATION_CODE_RE.test(code);
}

/** 예약번호 생성 — R{yyyymmdd}-{4자리 랜덤} */
export function generateReservationCode(date: Date = new Date()): string {
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    return `R${ymd}-${rand}`;
}

// =============================================================
// 상태값 · 라벨
// =============================================================

/** 예약 상태 (DB reservation_status enum 정본) */
export type ReservationStatus =
    "MATCHING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
    MATCHING: "매칭 대기중",
    CONFIRMED: "예약 확정",
    CANCELLED: "예약 취소",
    COMPLETED: "서비스 완료",
};

/**
 * 서비스 진행 상태 (DB service_status enum 정본, #22).
 *  SCHEDULED(진행 예정) → IN_PROGRESS(진행중) → ENDED(귀가 대기) → COMPLETED(완료)
 */
export type ServiceState = "SCHEDULED" | "IN_PROGRESS" | "ENDED" | "COMPLETED";

export const SERVICE_STATE_META: Record<
    ServiceState,
    { label: string; badge: string; dot: string }
> = {
    SCHEDULED: {
        label: "진행 예정",
        badge: "bg-blue-100 text-blue-600 dark:bg-blue-500/15",
        dot: "bg-blue-500",
    },
    IN_PROGRESS: {
        label: "진행중",
        badge: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
        dot: "bg-emerald-500",
    },
    ENDED: {
        label: "귀가 대기",
        badge: "bg-amber-100 text-amber-600 dark:bg-amber-500/15",
        dot: "bg-amber-500",
    },
    COMPLETED: {
        label: "완료",
        badge: "bg-muted text-muted-foreground",
        dot: "bg-muted-foreground",
    },
};

/**
 * 정산 상태 (파트너 정산 화면용, UI 상태).
 *  - 아직 DB 테이블 없음(#22에서 신설 예정).
 */
export type SettlementStatus = "paid" | "pending";

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
    paid: "지급 완료",
    pending: "지급 예정",
};

/** 리포트 작성 상태 (파트너 리포트 화면용, UI 상태). */
export type ReportStatus = "pending" | "done";

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
    pending: "작성 대기",
    done: "작성 완료",
};

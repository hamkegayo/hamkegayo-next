export const OPENING_EVENT_CAPACITY = 20;
export const OPENING_EVENT_DISMISS_KEY = "hamkegayo-opening-event-dismissed";
export const OPENING_EVENT_CHANNEL = "https://pf.kakao.com/_fImBX";
export const OPENING_EVENT_TERMS = [
    "서비스 이용 이력이 없는 신규 회원에게 최초 1회 적용합니다. 본인인증 기준으로 중복 참여를 제한합니다.",
    "Basic 첫 1시간 20,000원, Plus 첫 1시간 25,000원 상당의 기본요금이 무료입니다. 최소 예약시간은 2시간입니다.",
    "주말·공휴일 할증, 1시간 초과 요금, 연장요금 및 교통비·병원비 등 실비는 별도입니다.",
    "다른 쿠폰·포인트·프로모션과 중복 적용하지 않습니다. 남은 혜택은 현금이나 포인트로 지급하지 않습니다.",
    "상담 신청 순서가 아닌 실제 예약 확정 순으로 적용합니다. 결제 전 확보 상태는 확정 순번이 아닙니다.",
    "예약 확정 후 취소·노쇼·탈퇴해도 사용 순번과 혜택은 복원되지 않습니다. 취소·환불은 이용약관에 따릅니다.",
] as const;
/** 로컬 날짜 기준: 사용자의 당일 닫기는 다음 로컬 날짜에 해제된다. */
export function openingEventLocalDate(now = new Date()): string {
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}

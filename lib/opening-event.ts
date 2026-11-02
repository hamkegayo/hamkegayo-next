/**
 * 오픈 이벤트 조건 (#297 사용자 확정, 2026-10-31).
 *
 *  할인액·정원·종료 시각의 실제 판단은 DB 가 한다 — `opening_event_discount()`,
 *  `opening_campaign.capacity`·`ends_at` (마이그레이션 110). 아래 값은 안내 문구용이며
 *  클라이언트 시계나 이 상수로 적용 여부를 정하지 않는다.
 *  할인액은 약관 제11조 ① 의 서비스별 시간당 기본요금 1시간분과 같은 고정액이다.
 */
export const OPENING_EVENT_CAPACITY = 10;
export const OPENING_EVENT_DISCOUNT = { basic: 20_000, plus: 25_000 } as const;
/** 결제 확정 마감(포함). DB 의 ends_at 은 그 다음 순간인 2027-01-01 00:00 +09:00 이다. */
export const OPENING_EVENT_DEADLINE_LABEL = "2026년 12월 31일 23시 59분 59초";
export const OPENING_EVENT_DISMISS_KEY = "hamkegayo-opening-event-dismissed";
export const OPENING_EVENT_CHANNEL = "https://pf.kakao.com/_fImBX";

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
/** "Basic 20,000원 · Plus 25,000원" */
export const OPENING_EVENT_DISCOUNT_LABEL = `Basic ${won(OPENING_EVENT_DISCOUNT.basic)} · Plus ${won(OPENING_EVENT_DISCOUNT.plus)}`;

/** #276 의 공통 25,000원에서 Basic 할인액이 줄어든 변경 안내 (#297). */
export const OPENING_EVENT_CHANGE_NOTICE = `쿠폰 할인액이 서비스별 최초 1시간 요금으로 바뀌어 Basic은 25,000원에서 ${won(OPENING_EVENT_DISCOUNT.basic)}으로 변경되었습니다(Plus ${won(OPENING_EVENT_DISCOUNT.plus)} 유지). 변경 전에 결제가 확정된 예약은 확정 당시 할인액을 유지합니다.`;

export const OPENING_EVENT_TERMS = [
    "정상 서비스 이용 완료 이력이 없는 신규 회원에게 인증된 이메일 계정당 1회 적용합니다. 같은 이메일로 재가입해도 중복 참여할 수 없습니다. 관리자·파트너·직원·테스트 계정은 제외합니다.",
    `예약한 서비스의 최초 1시간 요금을 할인합니다(Basic ${won(OPENING_EVENT_DISCOUNT.basic)}, Plus ${won(OPENING_EVENT_DISCOUNT.plus)}). 이용시간이나 주말·공휴일 할증과 관계없이 같은 금액이며, 예약 1건에 1장 적용합니다. 대상자 쿠폰함에 자동 표시되며 최소 예약시간은 2시간입니다.`,
    "예약 서비스 요금에서 쿠폰을 차감하며 연장요금 및 교통비·병원비 등 실비는 별도입니다. 주말·공휴일 할증률은 예약 당시 안내된 요금 정책에 따릅니다.",
    `${OPENING_EVENT_DEADLINE_LABEL}(한국 시간)까지 결제가 확정된 예약에 적용합니다. 서비스 이용일이 아닌 결제 확정 시점 기준이며, 이 시각까지 결제가 확정되지 않으면 쿠폰이 적용되지 않습니다. 이때 진행 중이던 결제는 취소되며 쿠폰 없이 다시 결제할 수 있습니다.`,
    `이벤트 참여를 위해 인증 이메일을 HMAC 식별값으로 처리합니다. 같은 이메일 재가입을 포함한 중복 참여 방지에 사용하며, 행사 종료(${OPENING_EVENT_DEADLINE_LABEL} 기간 만료 또는 그 전 운영 종료) 후 관련 결제·취소·환불 처리가 끝나면 파기합니다. 자세한 항목·권리 행사 방법은 /event/opening에서 확인할 수 있습니다.`,
    "다른 쿠폰·포인트·프로모션과 중복 적용하지 않습니다. 남은 혜택은 현금이나 포인트로 지급하지 않습니다.",
    `쿠폰 보유만으로 혜택이 확보되지는 않습니다. 실제 결제 완료·예약 확정 선착순 ${OPENING_EVENT_CAPACITY}명(Basic·Plus 합산, 이벤트 시작 후 사용 인원 포함)에게 적용하며, ${OPENING_EVENT_CAPACITY}명이 모두 사용하면 기간 중이라도 종료되고 미사용 쿠폰도 사용할 수 없습니다. 결제 전 확보 상태는 확정 순번이 아닙니다.`,
    "고객 취소·노쇼·탈퇴 후 혜택은 복원되지 않습니다. 노쇼 비용에는 할인을 적용하지 않습니다. 회사·파트너 사유의 제공 불가는 실제 결제액 전액 환불 후 담당자 확인을 거쳐 혜택 재사용을 허용하며, 행사 종료 후에는 재사용할 수 없습니다.",
    "고객 요청으로 일찍 종료하면 최소 1시간 및 실제 이용시간으로 계산한 서비스 요금 한도 내에서 쿠폰을 차감합니다. 남은 할인액은 소멸하며 현금·포인트로 지급하지 않습니다. 회사·파트너 귀책이나 응급 중단은 별도 확인합니다.",
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

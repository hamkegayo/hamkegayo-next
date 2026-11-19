import { COMPANY } from "@/lib/legal/company";

/**
 * 신규 방식(선결제 후 운영자 직접 배정, #300) 고객 안내문.
 *
 *  ⚠️ 결제 완료 안내문은 확정된 원문이다. 문구를 바꾸지 않는다.
 *     "예약 확정" 으로 읽히지 않게 결제 직후에는 접수·확인 중임을 말한다.
 *  ⚠️ 약관 제9조 ④⑤ 와 순서가 다르다. 출시(플래그 기본 전환) 전 약관 개정·고지가 필요하다.
 */
export const DIRECT_COMPLETE_TITLE = "예약 신청 및 결제가 완료되었습니다.";

export const DIRECT_COMPLETE_PARAGRAPHS = [
    "예약 신청 및 결제가 완료되었습니다.",
    "현재 동행 파트너를 확인하고 있으며, 24시간 이내에 예약 진행 결과를 안내드리겠습니다.",
    "파트너 배정이 완료되면 예약이 최종 확정되며, 배정이 어려운 경우 결제하신 금액은 전액 환불됩니다.",
    "급한 예약이나 문의가 있으신 경우 고객센터로 전화해 주세요.",
] as const;

/** 고객센터 전화 연결 — 기존 고객센터 설정(COMPANY.tel)을 그대로 쓴다. */
export const CUSTOMER_CENTER_TEL = COMPANY.tel;
export const CUSTOMER_CENTER_TEL_HREF = `tel:${COMPANY.tel}`;
export const CUSTOMER_CENTER_CALL_LABEL = "고객센터 전화하기";

/** 급한 예약(24시간 미만) 전화 상담 안내 */
export const URGENT_NOTICE_BASE =
    "급한 예약은 고객센터로 전화해 주시면 빠르게 상담해 드립니다.";
export const URGENT_NOTICE_EMPHASIS =
    "예약 희망 시각까지 24시간 미만입니다. 파트너 확인에 시간이 걸릴 수 있어 전화 상담을 권해 드립니다. 온라인 결제는 그대로 진행하실 수 있습니다.";
export const URGENT_NOTICE_COMPLETE_EMPHASIS =
    "예약 희망 시각까지 24시간 미만입니다. 빠른 파트너 배정이 필요하시면 고객센터로 전화해 주세요.";

/** 배정 전 취소 안내 */
export const DIRECT_CANCEL_NOTICE =
    "파트너 배정 전에는 언제든 취소할 수 있으며, 결제하신 금액은 전액 환불됩니다. 포인트와 쿠폰도 함께 되돌려 드립니다.";

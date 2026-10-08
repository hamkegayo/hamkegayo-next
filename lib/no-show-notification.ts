import type { SettlementDiff } from "./pricing";

export function noShowNotification(
    penaltyAmount: number,
    prepaidAmount: number,
    diff: SettlementDiff,
): string {
    const penalty = penaltyAmount.toLocaleString();
    if (diff.additional > 0)
        return `파트너가 예약시각부터 20분간 기다린 뒤 종료했습니다. 노쇼 비용에는 쿠폰 할인이 적용되지 않습니다. 약관에 따른 위약금 ${penalty}원 중 선결제 ${prepaidAmount.toLocaleString()}원을 반영한 차액 ${diff.additional.toLocaleString()}원을 추가 결제해 주세요.`;
    if (diff.refund > 0)
        return `파트너가 예약시각부터 20분간 기다린 뒤 종료했습니다. 약관에 따른 위약금 ${penalty}원을 선결제 금액에서 차감하고, 잔액 ${diff.refund.toLocaleString()}원을 확인 후 환불해 드립니다.`;
    return `파트너가 예약시각부터 20분간 기다린 뒤 종료했습니다. 약관에 따른 위약금 ${penalty}원이 선결제 금액에서 처리됩니다.`;
}

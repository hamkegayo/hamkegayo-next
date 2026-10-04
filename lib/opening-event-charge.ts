/** 사용자 승인: 정상 서비스만 할인, 노쇼에는 할인 미적용. 남는 혜택 현금화 없음. */
export function openingEventCustomerAmount(
    gross: number,
    discount: number,
    noShow = false,
): number {
    if (
        !Number.isInteger(gross) ||
        gross < 0 ||
        !Number.isInteger(discount) ||
        discount < 0
    )
        throw new Error("invalid_event_charge");
    return Math.max(0, gross - (noShow ? 0 : Math.min(gross, discount)));
}

import type { PaymentGateway, GatewayPayment } from "./types";

export type RefundExpectation = {
    orderId: string;
    transactionId: string;
    cash: number;
    amount: number;
    balanceBefore: number;
};
export function matchesRefundPayment(
    payment: GatewayPayment,
    expected: RefundExpectation,
) {
    return (
        payment.orderId === expected.orderId &&
        payment.transactionId === expected.transactionId &&
        payment.amount === expected.cash
    );
}
/** 신규 선점 때만 취소한다. 결과 조회는 잔액 확인만 수행하며 재송하지 않는다. */
export async function verifyApprovedRefund(
    gateway: PaymentGateway,
    expected: RefundExpectation,
    execute: boolean,
): Promise<GatewayPayment | null> {
    try {
        const before = await gateway.find({ orderId: expected.orderId });
        if (!matchesRefundPayment(before, expected)) return null;
        if (execute) {
            if (
                before.status !== "PAID" ||
                before.balanceAmount !== expected.balanceBefore ||
                expected.amount <= 0 ||
                expected.amount > expected.balanceBefore
            )
                return null;
            try {
                await gateway.cancel({
                    orderId: expected.orderId,
                    transactionId: expected.transactionId,
                    amount: expected.amount,
                    reason: "관리자 승인 미달분 환불",
                });
            } catch {
                /* 응답 유실도 원거래 조회로만 확인한다. */
            }
        }
        const after = execute
            ? await gateway.find({ orderId: expected.orderId })
            : before;
        return matchesRefundPayment(after, expected) &&
            after.balanceAmount === expected.balanceBefore - expected.amount &&
            ["PARTIAL_CANCELLED", "CANCELLED"].includes(after.status)
            ? after
            : null;
    } catch {
        return null;
    }
}

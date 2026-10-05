import type { PaymentGateway } from "./types";

export type ExceptionTransaction = {
    paymentId: string;
    orderId: string;
    transactionId: string | null;
    cash: number;
    targetBalance: number;
    status: string;
};

/** PG 콘솔 처리 결과를 조회만 한다. 취소·승인 API는 호출하지 않는다. */
export async function verifyExceptionTransactions(
    gateway: PaymentGateway,
    transactions: ExceptionTransaction[],
) {
    if (!transactions.length || transactions.length > 21) return null;
    const verified = [];
    try {
        for (const t of transactions) {
            if (
                t.status !== "PAID" ||
                !Number.isSafeInteger(t.cash) ||
                !Number.isSafeInteger(t.targetBalance) ||
                t.cash < 0 ||
                t.targetBalance < 0 ||
                t.targetBalance > t.cash
            )
                return null;
            // 현금 0원은 조회할 PG 거래가 없다. DB의 PAID 원장만 확인한다.
            if (t.cash === 0) {
                verified.push({ ...t, balance: 0 });
                continue;
            }
            if (!t.transactionId) return null;
            const payment = await gateway.find({ orderId: t.orderId });
            const status =
                t.targetBalance === t.cash
                    ? "PAID"
                    : t.targetBalance === 0
                      ? "CANCELLED"
                      : "PARTIAL_CANCELLED";
            if (
                payment.orderId !== t.orderId ||
                payment.transactionId !== t.transactionId ||
                payment.amount !== t.cash ||
                payment.balanceAmount !== t.targetBalance ||
                payment.status !== status
            )
                return null;
            verified.push({
                paymentId: t.paymentId,
                orderId: payment.orderId,
                transactionId: payment.transactionId,
                cash: payment.amount,
                balance: payment.balanceAmount,
            });
        }
        return verified;
    } catch {
        return null;
    }
}

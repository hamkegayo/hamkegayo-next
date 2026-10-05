import type { PaymentGateway } from "./types";

/** Claim 후 1회 실행. 불확정 결과는 inspect=true 조회만 허용한다. */
export async function cancelIncidentTransaction(
    gateway: PaymentGateway,
    input: {
        orderId: string;
        amount: number;
        reason: string;
        inspect: boolean;
    },
): Promise<{ completed: boolean; transactionId: string | null }> {
    let transactionId: string | null = null;
    try {
        const payment = await gateway.find({ orderId: input.orderId });
        transactionId = payment.transactionId;
        if (
            payment.orderId !== input.orderId ||
            payment.amount !== input.amount ||
            !transactionId
        )
            return { completed: false, transactionId };
        if (payment.status === "CANCELLED" && payment.balanceAmount === 0)
            return { completed: true, transactionId };
        if (
            input.inspect ||
            payment.status !== "PAID" ||
            payment.balanceAmount !== input.amount ||
            input.amount <= 0
        )
            return { completed: false, transactionId };
        await gateway.cancel({
            transactionId,
            orderId: input.orderId,
            reason: input.reason,
        });
        const verified = await gateway.find({ orderId: input.orderId });
        return {
            completed:
                verified.orderId === input.orderId &&
                verified.transactionId === transactionId &&
                verified.amount === input.amount &&
                verified.status === "CANCELLED" &&
                verified.balanceAmount === 0,
            transactionId,
        };
    } catch {
        return { completed: false, transactionId };
    }
}

import assert from "node:assert/strict";
import { verifyApprovedRefund } from "../lib/payments/approved-refund.ts";
const expected = {
    orderId: "order",
    transactionId: "tid",
    cash: 80000,
    amount: 20000,
    balanceBefore: 80000,
};
const full = {
    orderId: "order",
    transactionId: "tid",
    amount: 80000,
    status: "PAID",
    balanceAmount: 80000,
};
const done = { ...full, status: "PARTIAL_CANCELLED", balanceAmount: 60000 };
async function check(
    { before = full, after = done, execute = true, throws = false },
    want,
    cancelCount,
) {
    let calls = 0,
        cancels = 0;
    const gateway = {
        find: async () => (calls++ ? after : before),
        cancel: async () => {
            cancels++;
            if (throws) throw Error("response lost");
        },
    };
    const result = await verifyApprovedRefund(gateway, expected, execute);
    assert.equal(Boolean(result), want);
    assert.equal(cancels, cancelCount);
}
await check({}, true, 1);
await check({ throws: true }, true, 1);
await check({ before: { ...full, orderId: "other" } }, false, 0);
await check({ before: { ...full, balanceAmount: 70000 } }, false, 0);
await check({ after: { ...done, balanceAmount: 50000 } }, false, 1);
await check({ after: { ...done, transactionId: "other" } }, false, 1);
await check({ execute: false, before: done }, true, 0);
await check({ execute: false }, false, 0);
console.log(
    "PASS: approved refund identity, balance delta, response loss and read-only recovery",
);

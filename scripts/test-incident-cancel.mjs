import assert from "node:assert/strict";
import { cancelIncidentTransaction } from "../lib/payments/incident-cancel.ts";
const paid = {
    orderId: "test-order",
    transactionId: "test-tid",
    amount: 1000,
    status: "PAID",
    balanceAmount: 1000,
};
const cancelled = { ...paid, status: "CANCELLED", balanceAmount: 0 };
const input = {
    orderId: paid.orderId,
    amount: 1000,
    reason: "test recovery",
    inspect: false,
};
async function run(responses, inspect = false, throws = false) {
    let calls = 0;
    const gateway = {
        find: async () => responses.shift(),
        cancel: async () => {
            calls++;
            if (throws) throw new Error("timeout");
        },
    };
    const result = await cancelIncidentTransaction(gateway, {
        ...input,
        inspect,
    });
    return { result, calls };
}
assert.equal((await run([paid, cancelled])).result.completed, true);
assert.equal((await run([cancelled])).calls, 0);
assert.equal((await run([paid], true)).calls, 0);
assert.equal((await run([{ ...paid, orderId: "other" }])).calls, 0);
assert.equal((await run([{ ...paid, amount: 999 }])).calls, 0);
assert.equal(
    (await run([{ ...paid, status: "PARTIAL_CANCELLED", balanceAmount: 500 }]))
        .calls,
    0,
);
assert.equal((await run([paid], false, true)).result.completed, false);
assert.equal(
    (await run([paid, { ...cancelled, transactionId: "other" }])).result
        .completed,
    false,
);
assert.equal((await run([paid, paid])).result.completed, false);
console.log(
    "PASS: admin cancellation identity, amount, partial balance, inspection and unknown outcome",
);

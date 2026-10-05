import assert from "node:assert/strict";
import { verifyExceptionTransactions } from "../lib/payments/exception-verification.ts";
const t = {
    paymentId: "p1",
    orderId: "o1",
    transactionId: "tid1",
    cash: 60000,
    targetBalance: 20000,
    status: "PAID",
};
const p = {
    orderId: "o1",
    transactionId: "tid1",
    amount: 60000,
    balanceAmount: 20000,
    status: "PARTIAL_CANCELLED",
};
let writes = 0;
const gateway = {
    find: async () => p,
    cancel: async () => {
        writes++;
        throw new Error("must not cancel");
    },
    approve: async () => {
        writes++;
        throw new Error("must not approve");
    },
};
assert.equal(
    (await verifyExceptionTransactions(gateway, [t]))[0].balance,
    20000,
);
for (const change of [
    { orderId: "other" },
    { transactionId: "other" },
    { amount: 80000 },
    { balanceAmount: 20001 },
    { balanceAmount: null },
    { status: "PAID" },
]) {
    assert.equal(
        await verifyExceptionTransactions(
            { ...gateway, find: async () => ({ ...p, ...change }) },
            [t],
        ),
        null,
    );
}
assert.equal(
    await verifyExceptionTransactions(
        {
            ...gateway,
            find: async () => {
                throw new Error("timeout");
            },
        },
        [t],
    ),
    null,
);
assert.equal(
    await verifyExceptionTransactions(gateway, [{ ...t, status: "PENDING" }]),
    null,
);
assert.equal(await verifyExceptionTransactions(gateway, []), null);
assert.equal(
    await verifyExceptionTransactions(gateway, [{ ...t, targetBalance: -1 }]),
    null,
);
const full = { ...t, targetBalance: 0 };
assert.equal(
    (
        await verifyExceptionTransactions(
            {
                ...gateway,
                find: async () => ({
                    ...p,
                    balanceAmount: 0,
                    status: "CANCELLED",
                }),
            },
            [full],
        )
    ).length,
    1,
);
const extra = { ...t, targetBalance: 60000 };
assert.equal(
    (
        await verifyExceptionTransactions(
            {
                ...gateway,
                find: async () => ({
                    ...p,
                    balanceAmount: 60000,
                    status: "PAID",
                }),
            },
            [extra],
        )
    ).length,
    1,
);
let reads = 0;
assert.equal(
    (
        await verifyExceptionTransactions(
            {
                ...gateway,
                find: async () => {
                    reads++;
                    return p;
                },
            },
            [{ ...t, cash: 0, targetBalance: 0, transactionId: null }],
        )
    ).length,
    1,
);
assert.equal(reads, 0);
assert.equal(writes, 0);
console.log(
    "PASS: exception PG identity, cash/balance/status, timeout, zero cash and read-only verification",
);

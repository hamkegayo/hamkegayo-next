import assert from "node:assert/strict";
import { evidenceLinkTTL } from "../lib/evidence-retention.ts";
const now = Date.parse("2026-10-05T00:00:00Z");
const status = {
    expiresAt: new Date(now + 400000).toISOString(),
    appealOpen: false,
    unavailable: false,
};
assert.equal(evidenceLinkTTL(status, now), 300);
assert.equal(
    evidenceLinkTTL(
        { ...status, expiresAt: new Date(now + 10000).toISOString() },
        now,
    ),
    10,
);
assert.equal(
    evidenceLinkTTL({ ...status, expiresAt: new Date(now).toISOString() }, now),
    0,
);
assert.equal(evidenceLinkTTL({ ...status, expiresAt: "invalid" }, now), 0);
assert.equal(evidenceLinkTTL({ ...status, appealOpen: true }, now), 300);
assert.equal(evidenceLinkTTL({ ...status, unavailable: true }, now), 0);
assert.equal(evidenceLinkTTL(null, now), 0);
console.log("PASS: evidence URL TTL 7 checks");

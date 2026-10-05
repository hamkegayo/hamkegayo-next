import assert from "node:assert/strict";
import { operationalNoticeEffectiveDate } from "../lib/legal/operational-release.ts";
assert.equal(
    operationalNoticeEffectiveDate("2026-10-05", "production"),
    "2026년 10월 5일",
);
assert.match(operationalNoticeEffectiveDate("", "preview"), /시행 예정/);
assert.throws(() => operationalNoticeEffectiveDate("", "production"));
assert.throws(() => operationalNoticeEffectiveDate("2026-02-30", "production"));
console.log("PASS: operational notice date 4 checks");

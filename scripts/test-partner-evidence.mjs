import assert from "node:assert/strict";
import {
    evidenceFileType,
    EVIDENCE_MAX_SIZE,
    EVIDENCE_MAX_FILES,
} from "../lib/partner-evidence.ts";
assert.equal(EVIDENCE_MAX_SIZE, 5242880);
assert.equal(EVIDENCE_MAX_FILES, 5);
assert.equal(
    evidenceFileType(Uint8Array.from([255, 216, 255, 0])),
    "image/jpeg",
);
assert.equal(
    evidenceFileType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
);
assert.equal(
    evidenceFileType(new TextEncoder().encode("%PDF-1.7")),
    "application/pdf",
);
assert.equal(
    evidenceFileType(new TextEncoder().encode("<script>fake pdf</script>")),
    null,
);
assert.equal(evidenceFileType(new Uint8Array()), null);
console.log("PASS: evidence file signature and limits");

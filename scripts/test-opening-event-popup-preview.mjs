import assert from "node:assert/strict";
import { openingEventPopupPreviewEnabled } from "../lib/opening-event-popup-preview.ts";

const staging = {
    vercelEnv: "preview",
    supabaseUrl: "https://aryrlfprkxntfkpgyayc.supabase.co",
    popupPreview: "true",
};
assert.equal(openingEventPopupPreviewEnabled(staging), true);
assert.equal(
    openingEventPopupPreviewEnabled({ ...staging, vercelEnv: "production" }),
    false,
);
assert.equal(
    openingEventPopupPreviewEnabled({ ...staging, vercelEnv: undefined }),
    false,
);
assert.equal(
    openingEventPopupPreviewEnabled({
        ...staging,
        supabaseUrl: "https://scpczxkcmnpubtmnqkem.supabase.co",
    }),
    false,
);
assert.equal(
    openingEventPopupPreviewEnabled({
        ...staging,
        supabaseUrl: "https://aryrlfprkxntfkpgyayc.supabase.co.example.com",
    }),
    false,
);
assert.equal(
    openingEventPopupPreviewEnabled({ ...staging, supabaseUrl: "invalid" }),
    false,
);
assert.equal(
    openingEventPopupPreviewEnabled({ ...staging, popupPreview: "false" }),
    false,
);
console.log("PASS: popup preview staging-only guard (7 cases)");

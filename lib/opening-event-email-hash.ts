import { createHmac } from "node:crypto";

/** 승인된 이메일 계정당 1회 정책. HMAC도 개인정보이며 고객에게 반환하지 않는다. */
export function openingEventEmailHash(email: string, key: string): string {
    if (key.length < 32) throw new Error("opening_event_hmac_key_missing");
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@"))
        throw new Error("invalid_email");
    return createHmac("sha256", key)
        .update(`opening-event:email:v1:${normalized}`)
        .digest("hex");
}

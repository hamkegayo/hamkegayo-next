import { createHmac } from "node:crypto";

/** RFC 6238 TOTP (SHA-1, 30초, 6자리). 관리자 2단계 인증 등록·로그인에 쓴다. */
export function totp(base32Secret: string, now = Date.now()): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const clean = base32Secret
        .replace(/=+$/, "")
        .replace(/\s/g, "")
        .toUpperCase();
    let bits = "";
    for (const ch of clean) {
        const v = alphabet.indexOf(ch);
        if (v < 0) throw new Error("TOTP 시크릿 형식이 올바르지 않습니다.");
        bits += v.toString(2).padStart(5, "0");
    }
    const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
    const hmac = createHmac("sha1", key).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return String(code).padStart(6, "0");
}

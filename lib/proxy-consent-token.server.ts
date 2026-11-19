import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

/**
 * 본인 동의 링크 토큰 (#306, 처리방침 제10조 ②).
 * 원문은 보호자에게 보여주는 링크에만 담기고 DB 에는 SHA-256 해시만 저장한다.
 */
export function generateConsentToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: hashConsentToken(token) };
}

export function hashConsentToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** base64url 32바이트(43자). 형식이 다르면 DB 조회 전에 버린다. */
export function isWellFormedConsentToken(token: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/.test(token);
}

async function siteBase(): Promise<string> {
    const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (configured) return configured;
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    return host ? `${proto}://${host}` : "https://www.hamkegayo.kr";
}

export async function buildConsentLink(token: string): Promise<string> {
    return `${await siteBase()}/consent/${token}`;
}

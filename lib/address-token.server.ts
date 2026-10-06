import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 주소 검색 결과의 "도로명주소 ↔ 법정동코드" 결합 서명 (#232 리뷰).
 *
 * 브라우저가 보낸 코드는 신뢰할 수 없다. 검색 결과마다 서버가 서명을 붙여 내려주고,
 * 예약 저장 때 서명이 맞고 입력 주소가 그 주소로 시작할 때만 코드를 기록한다.
 * 키: ADDRESS_TOKEN_SECRET. 없으면 서버 전용 서비스 키에서 용도를 분리해 파생한다.
 * 둘 다 없으면 서명하지 않으며, 코드는 저장되지 않는다(매칭은 주소 글자로 대신 판정).
 */

function secret(): Buffer | null {
    const own = process.env.ADDRESS_TOKEN_SECRET;
    if (own) return Buffer.from(own, "utf8");
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!service) return null;
    return createHmac("sha256", service)
        .update("hamkegayo/address-region-token/v1")
        .digest();
}

function mac(key: Buffer, roadAddr: string, code: string): string {
    return createHmac("sha256", key)
        .update(`${roadAddr}\n${code}`)
        .digest("base64url");
}

export function signAddressRegion(
    roadAddr: string,
    code: string,
): string | null {
    const key = secret();
    return key ? mac(key, roadAddr, code) : null;
}

export function verifyAddressRegion(
    roadAddr: string,
    code: string,
    token: string,
): boolean {
    const key = secret();
    if (!key || !token) return false;
    const expected = Buffer.from(mac(key, roadAddr, code));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * 예약에 기록할 코드. 검색으로 고른 주소(base)·코드·서명이 맞고,
 * 최종 입력 주소가 그 주소로 시작할 때(동·호수 덧붙임 허용)만 코드를 돌려준다.
 */
export function verifiedRegionCode(input: {
    address: string;
    base?: string;
    code?: string;
    token?: string;
}): string | null {
    const { address, base, code, token } = input;
    if (!base || !code || !token || !/^\d{10}$/.test(code)) return null;
    if (!address.trim().startsWith(base.trim())) return null;
    return verifyAddressRegion(base.trim(), code, token) ? code : null;
}

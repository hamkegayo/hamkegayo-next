import { afterEach, describe, expect, it, vi } from "vitest";

import {
    signAddressRegion,
    verifiedRegionCode,
    verifyAddressRegion,
} from "@/lib/address-token.server";

// 브라우저가 보낸 법정동코드를 그대로 믿지 않는다 (#232 리뷰).
const BASE = "강원특별자치도 원주시 서원대로 33 (단계동)";
const CODE = "5113011000";

afterEach(() => vi.unstubAllEnvs());

describe("주소·법정동코드 서명", () => {
    it("서명한 주소·코드만 검증된다", () => {
        vi.stubEnv("ADDRESS_TOKEN_SECRET", "test-secret");
        const token = signAddressRegion(BASE, CODE)!;
        expect(verifyAddressRegion(BASE, CODE, token)).toBe(true);
        expect(verifyAddressRegion(BASE, "1168000000", token)).toBe(false);
        expect(
            verifyAddressRegion("서울특별시 강남구 테헤란로 1", CODE, token),
        ).toBe(false);
        expect(verifyAddressRegion(BASE, CODE, "forged")).toBe(false);
    });

    it("다른 키로 만든 서명은 통하지 않는다", () => {
        vi.stubEnv("ADDRESS_TOKEN_SECRET", "key-a");
        const token = signAddressRegion(BASE, CODE)!;
        vi.stubEnv("ADDRESS_TOKEN_SECRET", "key-b");
        expect(verifyAddressRegion(BASE, CODE, token)).toBe(false);
    });

    it("전용 키가 없으면 서비스 키에서 파생하고, 둘 다 없으면 서명하지 않는다", () => {
        vi.stubEnv("ADDRESS_TOKEN_SECRET", "");
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
        expect(signAddressRegion(BASE, CODE)).toMatch(/^[\w-]{43}$/);
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
        expect(signAddressRegion(BASE, CODE)).toBeNull();
        expect(verifyAddressRegion(BASE, CODE, "x")).toBe(false);
    });
});

describe("예약에 기록할 코드", () => {
    it("동·호수를 덧붙인 주소는 인정하고 주소를 바꾸면 버린다", () => {
        vi.stubEnv("ADDRESS_TOKEN_SECRET", "test-secret");
        const token = signAddressRegion(BASE, CODE)!;
        expect(
            verifiedRegionCode({
                address: `${BASE} 101동 202호`,
                base: BASE,
                code: CODE,
                token,
            }),
        ).toBe(CODE);
        expect(
            verifiedRegionCode({
                address: "서울특별시 강남구 테헤란로 1",
                base: BASE,
                code: CODE,
                token,
            }),
        ).toBeNull();
        expect(
            verifiedRegionCode({
                address: BASE,
                base: BASE,
                code: "1168000000",
                token,
            }),
        ).toBeNull();
        expect(verifiedRegionCode({ address: BASE })).toBeNull();
    });
});

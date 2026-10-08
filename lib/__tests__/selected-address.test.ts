import { afterEach, describe, expect, it, vi } from "vitest";
import {
    joinSelectedAddress,
    splitSelectedAddress,
} from "@/lib/selected-address";
import { addressApiEndpoint } from "@/lib/juso.server";
import {
    signAddressRegion,
    verifiedRegionCode,
} from "@/lib/address-token.server";

afterEach(() => vi.unstubAllEnvs());
describe("검색 기본 주소와 상세주소", () => {
    it("기본 주소를 유지하고 상세주소만 나눈다", () => {
        expect(
            splitSelectedAddress(
                "서울시 도로 10 101동 202호",
                "서울시 도로 10",
            ),
        ).toEqual({ base: "서울시 도로 10", detail: "101동 202호" });
        expect(joinSelectedAddress(" 서울시 도로 10 ", " 101동 202호 ")).toBe(
            "서울시 도로 10 101동 202호",
        );
    });
    it("기준 주소가 없는 기존 데이터는 자르지 않는다", () => {
        expect(splitSelectedAddress("기존 주소 101호", "")).toEqual({
            base: "기존 주소 101호",
            detail: "",
        });
    });
    it("서명된 건물번호의 문자열 접두사를 이용한 기본 주소 변경을 거절한다", () => {
        vi.stubEnv("ADDRESS_TOKEN_SECRET", "test-secret");
        const base = "서울시 도로 10",
            code = "1111011900";
        expect(
            verifiedRegionCode({
                address: base + "0",
                base,
                code,
                token: signAddressRegion(base, code)!,
            }),
        ).toBeNull();
    });
    it("고정된 가짜 키만 모의 주소 서버로 보내고 실제 키는 공식 API로 보낸다", () => {
        vi.stubEnv("JUSO_CONFM_KEY", "real-placeholder");
        expect(addressApiEndpoint()).toBe(
            "https://business.juso.go.kr/addrlink/addrLinkApi.do",
        );
        vi.stubEnv("JUSO_CONFM_KEY", "e2e-local-address-only");
        expect(addressApiEndpoint()).toBe(
            "http://127.0.0.1:4011/addrlink/addrLinkApi.do",
        );
    });
});

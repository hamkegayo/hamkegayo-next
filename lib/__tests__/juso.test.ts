import { afterEach, describe, expect, it, vi } from "vitest";

import { sanitizeAddressKeyword, searchRoadAddress } from "@/lib/juso.server";

// 실제 juso.go.kr 은 부르지 않는다. 응답 형식은 2026-10-06 실호출로 확인한 값이다 (#226).
function jusoResponse(common: object, juso: object[] | null = []) {
    return new Response(JSON.stringify({ results: { common, juso } }), {
        status: 200,
    });
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("도로명주소 검색어 정리", () => {
    it("특수문자와 SQL 예약어를 지운다 (juso 검색어 규칙)", () => {
        expect(sanitizeAddressKeyword("올림픽로43길 88")).toBe(
            "올림픽로43길 88",
        );
        expect(sanitizeAddressKeyword("서울%' OR 1=1")).toBe("서울 1 1");
        expect(sanitizeAddressKeyword("  select  병원 ")).toBe("병원");
    });
});

describe("도로명주소 검색", () => {
    it("승인키가 없으면 직접 입력으로 돌린다", async () => {
        vi.stubEnv("JUSO_CONFM_KEY", "");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        expect(await searchRoadAddress("서울아산병원")).toMatchObject({
            ok: false,
            reason: "disabled",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("2글자 미만 검색어는 호출하지 않는다", async () => {
        vi.stubEnv("JUSO_CONFM_KEY", "test-key");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        expect(await searchRoadAddress(" 가 ")).toMatchObject({
            reason: "invalid",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("법정동코드와 건물명을 꺼내고, 코드가 없는 행은 뺀다", async () => {
        vi.stubEnv("JUSO_CONFM_KEY", "test-key");
        const fetchMock = vi.fn().mockResolvedValue(
            jusoResponse(
                { errorCode: "0", errorMessage: "정상", totalCount: "2" },
                [
                    {
                        roadAddr: "서울특별시 송파구 올림픽로43길 88 (풍납동)",
                        jibunAddr:
                            "서울특별시 송파구 풍납동 388-1 서울아산병원",
                        zipNo: "05505",
                        admCd: "1171010300",
                        bdNm: "서울아산병원",
                    },
                    { roadAddr: "코드 없는 주소", admCd: "" },
                ],
            ),
        );
        vi.stubGlobal("fetch", fetchMock);
        const res = await searchRoadAddress("서울아산병원");
        expect(res).toEqual({
            ok: true,
            total: 2,
            results: [
                {
                    roadAddr: "서울특별시 송파구 올림픽로43길 88 (풍납동)",
                    jibunAddr: "서울특별시 송파구 풍납동 388-1 서울아산병원",
                    zipNo: "05505",
                    regionCode: "1171010300",
                    buildingName: "서울아산병원",
                },
            ],
        });
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.searchParams.get("keyword")).toBe("서울아산병원");
        expect(url.searchParams.get("resultType")).toBe("json");
    });

    it("juso 오류 코드는 사용자가 고칠 수 있는 안내로 바꾼다", async () => {
        vi.stubEnv("JUSO_CONFM_KEY", "test-key");
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jusoResponse(
                    {
                        errorCode: "E0005",
                        errorMessage: "검색어가 입력되지 않았습니다.",
                    },
                    null,
                ),
            ),
        );
        expect(await searchRoadAddress("서울아산병원")).toEqual({
            ok: false,
            reason: "invalid",
            message: "검색어가 입력되지 않았습니다.",
        });
    });

    it("네트워크 실패는 직접 입력을 안내한다", async () => {
        vi.stubEnv("JUSO_CONFM_KEY", "test-key");
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
        expect(await searchRoadAddress("서울아산병원")).toMatchObject({
            ok: false,
            reason: "error",
        });
    });
});

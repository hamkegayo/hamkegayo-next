import { afterEach, describe, expect, it, vi } from "vitest";

import {
    hiraItems,
    looksLikeHospital,
    sanitizeHospitalKeyword,
    searchHospitals,
} from "@/lib/hospital-search.server";

// 실제 API 는 부르지 않는다. juso 건물명은 2026-10-06 실호출에서 본 값이다 (#226).
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
}

const HIRA_OK = {
    response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
        body: {
            items: {
                item: [
                    {
                        yadmNm: "서울아산병원",
                        clCdNm: "상급종합",
                        sidoCdNm: "서울",
                        sgguCdNm: "송파구",
                    },
                    {
                        yadmNm: "강릉아산병원",
                        clCdNm: "종합병원",
                        sidoCdNm: "강원",
                        sgguCdNm: "강릉시",
                    },
                ],
            },
            totalCount: 2,
        },
    },
};
const HIRA_NOT_REGISTERED = {
    OpenAPI_ServiceResponse: {
        cmmMsgHeader: { errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" },
    },
};
const JUSO_OK = {
    results: {
        common: { errorCode: "0", totalCount: "4" },
        juso: [
            { bdNm: "서울아산병원", siNm: "서울특별시", sggNm: "송파구" },
            {
                bdNm: "강릉아산병원아파트",
                siNm: "강원특별자치도",
                sggNm: "강릉시",
            },
            { bdNm: "강릉아산병원", siNm: "강원특별자치도", sggNm: "강릉시" },
            { bdNm: "강릉아산병원", siNm: "강원특별자치도", sggNm: "강릉시" },
        ],
    },
};

describe("병원 검색어·건물명 판별", () => {
    it("특수문자와 SQL 예약어를 지운다", () => {
        expect(sanitizeHospitalKeyword("아산병원' OR 1=1")).toBe(
            "아산병원 1 1",
        );
    });

    it("의료기관 건물만 남기고 아파트·연구동·생활관은 뺀다", () => {
        expect(looksLikeHospital("원주세브란스기독병원")).toBe(true);
        expect(looksLikeHospital("행복치과의원")).toBe(true);
        expect(looksLikeHospital("강릉아산병원아파트")).toBe(false);
        expect(looksLikeHospital("강남세브란스병원 의생명연구센터")).toBe(
            false,
        );
        expect(looksLikeHospital("서울삼성병원 제1생활관")).toBe(false);
        expect(looksLikeHospital("올림픽타워")).toBe(false);
    });

    it("심평원 item 이 1건이면 객체로 와도 배열로 다룬다", () => {
        expect(
            hiraItems({
                response: {
                    header: { resultCode: "00" },
                    body: { items: { item: { yadmNm: "강북삼성병원" } } },
                },
            }),
        ).toEqual([{ yadmNm: "강북삼성병원" }]);
        expect(
            hiraItems({
                response: { header: { resultCode: "00" }, body: { items: "" } },
            }),
        ).toEqual([]);
        expect(hiraItems(HIRA_NOT_REGISTERED)).toBeNull();
    });
});

describe("선호 병원 검색", () => {
    it("2글자 미만은 호출하지 않는다", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        expect(await searchHospitals(" 가 ")).toMatchObject({
            ok: false,
            reason: "invalid",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("심평원 결과를 이름·종별·지역으로 돌려준다", async () => {
        vi.stubEnv("DATA_GO_KR_SERVICE_KEY", "test-key");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(HIRA_OK)));
        expect(await searchHospitals("아산병원")).toEqual({
            ok: true,
            source: "hira",
            results: [
                {
                    name: "서울아산병원",
                    kind: "상급종합",
                    region: "서울 송파구",
                },
                {
                    name: "강릉아산병원",
                    kind: "종합병원",
                    region: "강원 강릉시",
                },
            ],
        });
    });

    it("심평원 활용신청 전이면 도로명주소 건물명 검색으로 대신한다", async () => {
        vi.stubEnv("DATA_GO_KR_SERVICE_KEY", "test-key");
        vi.stubEnv("JUSO_CONFM_KEY", "test-juso");
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string | URL) =>
                Promise.resolve(
                    String(url).includes("B551182")
                        ? json(HIRA_NOT_REGISTERED, 403)
                        : json(JUSO_OK),
                ),
            ),
        );
        expect(await searchHospitals("아산병원")).toEqual({
            ok: true,
            source: "juso",
            results: [
                { name: "서울아산병원", kind: "", region: "서울 송파구" },
                { name: "강릉아산병원", kind: "", region: "강원 강릉시" },
            ],
        });
    });

    it("둘 다 안 되면 직접 입력을 안내한다", async () => {
        vi.stubEnv("DATA_GO_KR_SERVICE_KEY", "");
        vi.stubEnv("JUSO_CONFM_KEY", "");
        expect(await searchHospitals("아산병원")).toMatchObject({
            ok: false,
            reason: "unavailable",
        });
    });
});

describe("심평원 인증키", () => {
    it("HIRA_SERVICE_KEY 가 있으면 공공데이터포털 공통 키보다 먼저 쓴다", async () => {
        vi.stubEnv("HIRA_SERVICE_KEY", "hira-key");
        vi.stubEnv("DATA_GO_KR_SERVICE_KEY", "common-key");
        const fetchMock = vi.fn().mockResolvedValue(json(HIRA_OK));
        vi.stubGlobal("fetch", fetchMock);
        await searchHospitals("아산병원");
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            "serviceKey=hira-key",
        );
    });

    it("전용 키가 없으면 공통 키로 호출한다", async () => {
        vi.stubEnv("HIRA_SERVICE_KEY", "");
        vi.stubEnv("DATA_GO_KR_SERVICE_KEY", "common-key");
        const fetchMock = vi.fn().mockResolvedValue(json(HIRA_OK));
        vi.stubGlobal("fetch", fetchMock);
        await searchHospitals("아산병원");
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            "serviceKey=common-key",
        );
    });
});

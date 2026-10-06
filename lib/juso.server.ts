/**
 * 도로명주소 검색 API (행정안전부 juso.go.kr) — 예약 출발지·병원 주소 검색 (#226).
 *
 * 서버에서만 호출한다. 승인키(JUSO_CONFM_KEY)는 브라우저로 내보내지 않는다.
 * 응답의 admCd 는 법정동코드(10자리)로, partner_activity_regions 와 같은 체계다.
 * 키가 없으면 enabled=false 를 돌려주고, 화면은 기존 직접 입력으로 동작한다.
 */

const ENDPOINT = "https://business.juso.go.kr/addrlink/addrLinkApi.do";
const TIMEOUT_MS = 5000;

export type AddressResult = {
    roadAddr: string;
    jibunAddr: string;
    zipNo: string;
    /** 법정동코드 10자리 */
    regionCode: string;
    /** 건물명 (병원 이름 자동 채우기에 쓴다) */
    buildingName: string;
};

export type AddressSearchResult =
    | { ok: true; results: AddressResult[]; total: number }
    | {
          ok: false;
          reason: "disabled" | "invalid" | "error";
          message: string;
      };

/** juso 검색어 규칙: 특수문자와 SQL 예약어는 거부되므로 미리 지운다. */
export function sanitizeAddressKeyword(raw: string): string {
    return raw
        .replace(/[%=><[\]{}'"`;\\]/g, " ")
        .replace(
            /\b(OR|SELECT|INSERT|DELETE|UPDATE|CREATE|DROP|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b/gi,
            " ",
        )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

export function isAddressSearchEnabled(): boolean {
    return Boolean(process.env.JUSO_CONFM_KEY);
}

type JusoItem = {
    roadAddr?: string;
    jibunAddr?: string;
    zipNo?: string;
    admCd?: string;
    bdNm?: string;
};

export async function searchRoadAddress(
    rawKeyword: string,
    page = 1,
): Promise<AddressSearchResult> {
    const key = process.env.JUSO_CONFM_KEY;
    if (!key)
        return {
            ok: false,
            reason: "disabled",
            message:
                "주소 검색을 사용할 수 없습니다. 주소를 직접 입력해 주세요.",
        };
    const keyword = sanitizeAddressKeyword(rawKeyword);
    if (keyword.replace(/\s/g, "").length < 2)
        return {
            ok: false,
            reason: "invalid",
            message: "도로명, 건물명, 지번 중 하나를 2글자 이상 입력해 주세요.",
        };

    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
        confmKey: key,
        currentPage: String(Math.max(1, Math.min(page, 20))),
        countPerPage: "10",
        keyword,
        resultType: "json",
    }).toString();

    try {
        const res = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
            results?: {
                common?: {
                    errorCode?: string;
                    errorMessage?: string;
                    totalCount?: string;
                };
                juso?: JusoItem[] | null;
            };
        };
        const common = body.results?.common;
        if (common?.errorCode !== "0") {
            // E0005 등 검색어 문제는 사용자가 고칠 수 있는 오류다.
            return {
                ok: false,
                reason: "invalid",
                message:
                    common?.errorMessage ||
                    "검색어를 확인해 주세요. 예) 올림픽로43길 88, 서울아산병원",
            };
        }
        const results = (body.results?.juso ?? [])
            .filter((j) => j.roadAddr && /^\d{10}$/.test(j.admCd ?? ""))
            .map((j) => ({
                roadAddr: j.roadAddr!,
                jibunAddr: j.jibunAddr ?? "",
                zipNo: j.zipNo ?? "",
                regionCode: j.admCd!,
                buildingName: j.bdNm ?? "",
            }));
        return { ok: true, results, total: Number(common.totalCount ?? 0) };
    } catch {
        return {
            ok: false,
            reason: "error",
            message:
                "주소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요.",
        };
    }
}

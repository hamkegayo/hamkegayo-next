/**
 * 선호 병원 검색 (#226). 파트너가 활동 정보에 선호 병원을 등록할 때 쓴다.
 *
 * 1순위: 건강보험심사평가원 병원정보서비스(공공데이터포털 B551182/hospInfoServicev2).
 *        의료기관만 나오고 종별(상급종합·종합·병원·의원 등)을 함께 준다.
 *        HIRA_SERVICE_KEY(없으면 DATA_GO_KR_SERVICE_KEY)에 이 API 활용신청이 되어 있어야 한다.
 * 2순위: 활용신청 전이거나 호출이 실패하면 도로명주소 API 건물명 검색으로 대신한다.
 *        건물명에 의료기관 표현이 있는 것만 남기고 아파트·생활관·연구동 등은 뺀다.
 * 둘 다 안 되면 화면은 직접 입력만 쓴다. 검색어는 병원 이름뿐이라 개인정보가 아니다.
 */

const HIRA_ENDPOINT =
    "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const JUSO_ENDPOINT = "https://business.juso.go.kr/addrlink/addrLinkApi.do";
const TIMEOUT_MS = 5000;

export type HospitalResult = {
    name: string;
    /** 종별 (예: 상급종합, 종합병원, 병원, 의원). 도로명주소 대체 검색이면 "" */
    kind: string;
    /** "서울 송파구" 처럼 시·도 + 시·군·구 */
    region: string;
};

export type HospitalSearchResult =
    | { ok: true; results: HospitalResult[]; source: "hira" | "juso" }
    | { ok: false; reason: "invalid" | "unavailable"; message: string };

/** 공공 API 검색어 규칙: 특수문자와 SQL 예약어는 거부되므로 미리 지운다 */
export function sanitizeHospitalKeyword(raw: string): string {
    return raw
        .replace(/[%=><[\]{}'"`;\\]/g, " ")
        .replace(
            /\b(OR|SELECT|INSERT|DELETE|UPDATE|CREATE|DROP|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b/gi,
            " ",
        )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 50);
}

const MEDICAL_NAME =
    /(병원|의원|의료원|보건소|보건지소|치과|한방|요양병원|클리닉|메디컬)/;
const NOT_MEDICAL =
    /(아파트|생활관|기숙사|연구동|연구센터|연구소|주차장|교수|사택|오피스텔|빌딩$)/;

const CORPORATE_PREFIX =
    /^(재단법인|학교법인|의료법인|사회복지법인|사단법인|종교법인)\s*\S*?(사회복지재단|복지재단|의료재단|재단|학원|법인|회)\s*/;

/**
 * 심평원 요양기관명 앞의 법인명을 뗀다.
 * "재단법인아산사회복지재단 서울아산병원" → "서울아산병원",
 * "학교법인가톨릭학원가톨릭대학교서울성모병원" → "가톨릭대학교서울성모병원" (2026-10-06 실호출 값).
 */
export function cleanHospitalName(name: string): string {
    // "재단법인아산사회복지재단부속 보령아산병원" 처럼 법인명 뒤에 "부속"이 붙는 경우도 뗀다.
    const cleaned = name
        .trim()
        .replace(CORPORATE_PREFIX, "")
        .replace(/^(부속|산하)\s*/, "")
        .trim();
    return cleaned || name.trim();
}

/** 도로명주소 대체 검색 결과 중 의료기관으로 보이는 건물만 남긴다 */
export function looksLikeHospital(buildingName: string): boolean {
    const name = buildingName.trim();
    return MEDICAL_NAME.test(name) && !NOT_MEDICAL.test(name);
}

function shortSido(sido: string): string {
    return sido
        .replace(/(특별시|광역시|특별자치시|특별자치도|통합특별시)$/, "")
        .replace(
            /^(충청|전라|경상)(북|남)도$/,
            (_, a: string, b: string) =>
                ({ 충청: "충", 전라: "전", 경상: "경" })[a] + b,
        )
        .replace(/도$/, "");
}

type HiraItem = {
    yadmNm?: string;
    clCdNm?: string;
    sidoCdNm?: string;
    sgguCdNm?: string;
};

/** HIRA 응답의 item 은 결과가 1건이면 배열이 아닌 객체로 온다 */
export function hiraItems(body: unknown): HiraItem[] | null {
    const response = (body as { response?: unknown })?.response as
        | {
              header?: { resultCode?: string };
              body?: { items?: { item?: HiraItem | HiraItem[] } | "" };
          }
        | undefined;
    if (!response || response.header?.resultCode !== "00") return null;
    const items = response.body?.items;
    if (!items || typeof items === "string") return [];
    const item = items.item;
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
}

async function searchHira(keyword: string): Promise<HospitalResult[] | null> {
    // 심평원 전용 키가 있으면 그것을, 없으면 같은 공공데이터포털 계정의 일반 인증키를 쓴다.
    const key =
        process.env.HIRA_SERVICE_KEY || process.env.DATA_GO_KR_SERVICE_KEY;
    if (!key) return null;
    // 일반 인증키(Encoding)를 그대로 붙인다 — lib/holidays.ts 와 같다.
    const url =
        `${HIRA_ENDPOINT}?pageNo=1&numOfRows=20&_type=json` +
        `&yadmNm=${encodeURIComponent(keyword)}&serviceKey=${key}`;
    try {
        const res = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const items = hiraItems(await res.json());
        if (items === null) return null;
        const seen = new Set<string>();
        const out: HospitalResult[] = [];
        for (const i of items) {
            if (!i.yadmNm) continue;
            const result = {
                name: cleanHospitalName(i.yadmNm),
                kind: i.clCdNm?.trim() ?? "",
                region: [shortSido(i.sidoCdNm ?? ""), i.sgguCdNm ?? ""]
                    .filter(Boolean)
                    .join(" "),
            };
            const key = `${result.name}|${result.region}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(result);
        }
        return out;
    } catch {
        return null;
    }
}

async function searchJuso(keyword: string): Promise<HospitalResult[] | null> {
    const key = process.env.JUSO_CONFM_KEY;
    if (!key) return null;
    const url = new URL(JUSO_ENDPOINT);
    url.search = new URLSearchParams({
        confmKey: key,
        currentPage: "1",
        countPerPage: "30",
        keyword,
        resultType: "json",
    }).toString();
    try {
        const res = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as {
            results?: {
                common?: { errorCode?: string };
                juso?:
                    { bdNm?: string; siNm?: string; sggNm?: string }[] | null;
            };
        };
        if (body.results?.common?.errorCode !== "0") return null;
        const seen = new Set<string>();
        const out: HospitalResult[] = [];
        for (const j of body.results.juso ?? []) {
            const name = j.bdNm?.trim() ?? "";
            const region = [shortSido(j.siNm ?? ""), j.sggNm ?? ""]
                .filter(Boolean)
                .join(" ");
            if (!looksLikeHospital(name) || seen.has(`${name}|${region}`))
                continue;
            seen.add(`${name}|${region}`);
            out.push({ name, kind: "", region });
        }
        return out;
    } catch {
        return null;
    }
}

export async function searchHospitals(
    rawKeyword: string,
): Promise<HospitalSearchResult> {
    const keyword = sanitizeHospitalKeyword(rawKeyword);
    if (keyword.replace(/\s/g, "").length < 2)
        return {
            ok: false,
            reason: "invalid",
            message: "병원 이름을 2글자 이상 입력해 주세요.",
        };
    const hira = await searchHira(keyword);
    if (hira !== null) return { ok: true, results: hira, source: "hira" };
    const juso = await searchJuso(keyword);
    if (juso !== null) return { ok: true, results: juso, source: "juso" };
    return {
        ok: false,
        reason: "unavailable",
        message:
            "병원 검색을 사용할 수 없습니다. 병원 이름을 직접 입력해 주세요.",
    };
}

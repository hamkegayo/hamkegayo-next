/**
 * 공휴일 판정 (서버 전용, #46).
 *  - 정본은 공공데이터포털 「특일 정보」 API. 대체공휴일·임시공휴일이 모두 내려온다.
 *  - API 실패 시에만 아래 폴백 테이블을 쓴다. 테이블은 매년 검증이 필요하다.
 *  - 주말(토·일) 판정은 API 없이 날짜만으로 한다.
 *
 * 약관 제13조 ① : 토요일, 일요일, 공휴일 및 대체공휴일에는 기본 서비스 이용요금의 30%를 할증한다.
 *
 * 환경변수 : DATA_GO_KR_SERVICE_KEY (공공데이터포털 일반 인증키, Encoding 값 그대로)
 */

const ENDPOINT =
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

/** 응답 캐시(초) — 공휴일은 거의 바뀌지 않지만 임시공휴일 지정을 하루 안에 반영한다. */
const CACHE_SECONDS = 60 * 60 * 24;

/**
 * API 실패 시 폴백 — 2026년 관공서 공휴일(대체공휴일 포함).
 *
 * ⚠️ 이 표는 API 가 죽었을 때만 쓰이는 보조 수단이다.
 *    음력 기반 공휴일(설날·부처님오신날·추석)과 임시공휴일은 매년 관보로 확인해 갱신할 것.
 *    토·일은 여기 없어도 날짜만으로 판정되므로 넣지 않는다.
 */
const FALLBACK_HOLIDAYS: Record<number, readonly string[]> = {
    2026: [
        "2026-01-01", // 신정
        "2026-02-16", // 설날 연휴
        "2026-02-17", // 설날
        "2026-02-18", // 설날 연휴
        "2026-03-01", // 삼일절
        "2026-03-02", // 삼일절 대체공휴일
        "2026-05-05", // 어린이날
        "2026-05-24", // 부처님오신날
        "2026-05-25", // 부처님오신날 대체공휴일
        "2026-06-03", // 제9회 전국동시지방선거
        "2026-06-06", // 현충일
        "2026-08-15", // 광복절
        "2026-08-17", // 광복절 대체공휴일
        "2026-09-24", // 추석 연휴
        "2026-09-25", // 추석
        "2026-09-26", // 추석 연휴
        "2026-10-03", // 개천절
        "2026-10-05", // 개천절 대체공휴일
        "2026-10-09", // 한글날
        "2026-12-25", // 성탄절
    ],
};

type RestDeItem = {
    locdate?: number | string;
    isHoliday?: string;
    dateName?: string;
};

/** API 응답의 item 은 0건이면 없고, 1건이면 배열이 아닌 객체로 온다. */
function toItemArray(raw: unknown): RestDeItem[] {
    if (Array.isArray(raw)) return raw as RestDeItem[];
    if (raw && typeof raw === "object") return [raw as RestDeItem];
    return [];
}

/** 20260925 → "2026-09-25" */
function toIsoDate(locdate: number | string): string | null {
    const s = String(locdate);
    if (!/^\d{8}$/.test(s)) return null;
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * 해당 연·월의 공휴일 목록을 API 에서 조회한다. 실패하면 null.
 *
 * serviceKey 는 이미 URL 인코딩된 값이라 URLSearchParams 로 붙이면 이중 인코딩된다.
 * 쿼리 문자열에 그대로 이어 붙인다.
 */
async function fetchHolidayMonth(
    year: number,
    month: number,
): Promise<Set<string> | null> {
    const key = process.env.DATA_GO_KR_SERVICE_KEY;
    if (!key) return null;

    const url =
        `${ENDPOINT}?solYear=${year}&solMonth=${String(month).padStart(2, "0")}` +
        `&numOfRows=100&_type=json&serviceKey=${key}`;

    try {
        const res = await fetch(url, {
            next: { revalidate: CACHE_SECONDS, tags: ["holidays"] },
        });
        if (!res.ok) {
            console.error("[holidays] API 응답 오류:", res.status);
            return null;
        }

        // 인증키 오류 등은 200 + XML 로 내려오는 경우가 있어 JSON 파싱을 보호한다.
        const body: unknown = await res.json();
        const items = toItemArray(
            (
                body as {
                    response?: { body?: { items?: { item?: unknown } } };
                }
            )?.response?.body?.items?.item,
        );

        const out = new Set<string>();
        for (const item of items) {
            if (item.isHoliday && item.isHoliday !== "Y") continue;
            const iso = item.locdate == null ? null : toIsoDate(item.locdate);
            if (iso) out.add(iso);
        }
        return out;
    } catch (e) {
        console.error("[holidays] API 호출 실패:", e);
        return null;
    }
}

/** "YYYY-MM-DD" → 요일(0=일 ~ 6=토). 형식이 아니면 null. */
function weekdayOf(isoDate: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
    if (!m) return null;
    // 로컬 타임존 영향을 받지 않도록 UTC 로 계산한다.
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

/** 주말(토·일) 여부 */
export function isWeekend(isoDate: string): boolean {
    const w = weekdayOf(isoDate);
    return w === 0 || w === 6;
}

/** 공휴일·대체공휴일 여부 — API 우선, 실패 시 폴백 테이블 */
export async function isPublicHoliday(isoDate: string): Promise<boolean> {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
    if (!m) return false;

    const year = Number(m[1]);
    const month = Number(m[2]);

    const fromApi = await fetchHolidayMonth(year, month);
    if (fromApi) return fromApi.has(isoDate);

    const fallback = FALLBACK_HOLIDAYS[year];
    if (!fallback) {
        console.error(
            `[holidays] ${year}년 폴백 테이블이 없습니다. ${isoDate} 를 평일로 처리합니다.`,
        );
        return false;
    }
    return fallback.includes(isoDate);
}

/**
 * 30% 할증 대상 날짜인지 (약관 제13조 ①).
 * 주말은 API 없이 판정하므로 API 가 죽어도 대부분의 할증은 정상 동작한다.
 */
export async function isSurchargeDate(isoDate: string): Promise<boolean> {
    if (isWeekend(isoDate)) return true;
    return isPublicHoliday(isoDate);
}

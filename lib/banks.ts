/**
 * 은행 코드 (#51) — 금융결제원 표준 기관코드 3자리.
 *
 *  DB 에 코드로 저장하고 화면에는 이름으로 보여 준다. 은행명이 바뀌어도
 *  (예: 신한 → 통합 이후 명칭 변경) 저장된 값은 그대로 두고 여기만 고치면 된다.
 *  이름을 그대로 저장하면 과거 데이터가 지금 없는 은행을 가리키게 된다.
 *
 *  ⚠️ 이 목록은 **검증 화이트리스트이기도 하다.** 서버 액션이 여기 없는
 *     코드를 거절하므로, 값을 지울 때는 이미 등록된 계좌가 있는지 먼저 본다.
 */

export type Bank = { code: string; name: string };

/** 정산 이체가 가능한 은행. 저축은행·증권사는 아직 넣지 않는다. */
export const BANKS: readonly Bank[] = [
    { code: "004", name: "KB국민은행" },
    { code: "088", name: "신한은행" },
    { code: "020", name: "우리은행" },
    { code: "081", name: "하나은행" },
    { code: "011", name: "NH농협은행" },
    { code: "090", name: "카카오뱅크" },
    { code: "092", name: "토스뱅크" },
    { code: "089", name: "케이뱅크" },
    { code: "003", name: "IBK기업은행" },
    { code: "023", name: "SC제일은행" },
    { code: "027", name: "한국씨티은행" },
    { code: "031", name: "대구은행" },
    { code: "032", name: "부산은행" },
    { code: "034", name: "광주은행" },
    { code: "035", name: "제주은행" },
    { code: "037", name: "전북은행" },
    { code: "039", name: "경남은행" },
    { code: "045", name: "새마을금고" },
    { code: "048", name: "신협" },
    { code: "071", name: "우체국" },
] as const;

const BY_CODE = new Map(BANKS.map((b) => [b.code, b]));

export function bankName(code: string): string | null {
    return BY_CODE.get(code)?.name ?? null;
}

export function isValidBankCode(code: string): boolean {
    return BY_CODE.has(code);
}

/**
 * 계좌번호 정규화 — 숫자만 남긴다.
 *
 *  사람은 하이픈을 넣기도 하고 안 넣기도 한다. 저장 형식이 갈리면 같은
 *  계좌가 다른 값으로 들어가고, 마스킹 뒷자리도 어긋난다.
 */
export function normalizeAccountNumber(raw: string): string {
    return raw.replace(/\D/g, "");
}

/** 국내 은행 계좌번호 길이 범위. 은행마다 달라 자릿수까지는 검증하지 않는다. */
export const ACCOUNT_MIN_LEN = 8;
export const ACCOUNT_MAX_LEN = 20;

export function isValidAccountNumber(digits: string): boolean {
    return (
        digits.length >= ACCOUNT_MIN_LEN &&
        digits.length <= ACCOUNT_MAX_LEN &&
        /^\d+$/.test(digits)
    );
}

/**
 * 화면·목록용 마스킹.
 *
 *  ⚠️ 전체 번호를 받아 가리는 것이 아니라, **저장해 둔 뒷 4자리만으로**
 *     만든다. 마스킹을 보여 주려고 전체 번호를 읽어 오면 열람 기록이
 *     남지 않는 조회가 상시로 생긴다(#51 · #50 원칙).
 */
export function maskAccount(last4: string): string {
    return `****${last4}`;
}

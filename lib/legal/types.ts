/**
 * 약관·방침 원문을 담는 자료구조.
 *
 *  ⚠️ **정본은 노션이다.** 이 파일들은 노션 원문을 화면에 옮긴 것이고,
 *     조문을 요약하거나 다듬지 않는다. 개정되면 `/legal-sync` 로 노션에서
 *     다시 받아 데이터만 교체한다 — 렌더러는 건드리지 않는다.
 *
 *  내용을 JSX 가 아니라 데이터로 두는 이유는 두 가지다.
 *   1. 개정 시 바뀌는 곳이 데이터 한 곳뿐이라 diff 가 조문과 1:1 로 읽힌다
 *   2. 약관·방침이 같은 렌더러를 쓰므로 두 페이지의 서식이 어긋나지 않는다
 */

export type LegalBlock =
    /** 문단. 항 번호(①②③)는 텍스트에 그대로 포함한다 */
    | { type: "p"; text: string }
    /** 호 목록(1. 2. 3.). 번호는 렌더러가 붙인다 */
    | { type: "list"; items: string[] }
    /** 표 중간의 소제목 (예: "[단계 1] 매칭 전 — 파트너의 수락 여부 검토 단계") */
    | { type: "subhead"; text: string }
    /** 표. 첫 행은 머리행이다 */
    | { type: "table"; head: string[]; rows: string[][] };

export type LegalArticle = {
    /** "제1조" · "부칙" 등 조 번호. 목차 앵커(id)로도 쓰인다 */
    no: string;
    /** "목적" 등 조 제목. 부칙처럼 제목이 없으면 생략한다 */
    title?: string;
    blocks: LegalBlock[];
};

export type LegalDocument = {
    /** "이용약관" · "개인정보처리방침" */
    title: string;
    /** "2026년 9월 3일" — 원문 표기를 그대로 쓴다 */
    effectiveDate: string;
    articles: LegalArticle[];
};

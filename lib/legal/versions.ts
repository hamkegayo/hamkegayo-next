/**
 * 버전별 본문 해시 — 버전을 올리지 않고 본문만 고치는 것을 막는다.
 *
 *  ## 왜 필요한가
 *
 *  2026-09-06 개정에서 실제로 그 일이 일어났다. 두 문서 모두 본문이 바뀌었는데
 *  `version` 은 그대로였다.
 *
 *  ```
 *  d10ef15  privacy.ts  +18 / -3   ← version 변경 없음
 *  01def53  terms.ts    +21 / -1   ← version 변경 없음
 *  ```
 *
 *  `user_agreements` 는 `version` 문자열만 저장한다. 그래서 개정 전 본문에
 *  동의한 사람과 개정 후에 동의한 사람의 기록이 **같은 값**이 됐다. 어느 본문에
 *  동의했는지 되짚을 수 없고, `unique (user_id, agreement_type, version)` 때문에
 *  재동의 행조차 들어가지 않는다 (#105 · #91).
 *
 *  버전을 올리는 것은 사람이 한다. **사람은 잊는다.** 그래서 CI 가 대조한다 —
 *  `npm run test:legal` 이 현재 본문의 해시를 계산해 아래 표와 맞춰 본다.
 *
 *  ## 개정할 때
 *
 *  1. 노션에서 본문을 받아 `terms.ts` · `privacy.ts` 를 교체한다
 *  2. `version` 을 **개정일 ISO** 로 올린다 (시행일이 아니다)
 *  3. `revisedDate` 표기를 맞춘다
 *  4. `npm run test:legal` 이 알려주는 새 해시를 아래에 **추가**한다
 *     — 기존 줄은 지우지 않는다. 그 자체가 개정 이력이다
 */

/** 해시 대상 문서 키 */
export type LegalDocKey = "TERMS" | "PRIVACY";

/**
 * `version` → 본문 해시(sha256 앞 16자).
 *
 * 해시는 `JSON.stringify(doc.articles)` 에 대해 계산한다 — 조문 데이터만 본다.
 * 주석·서식·시행일 표기가 바뀌어도 해시는 흔들리지 않는다.
 */
export const LEGAL_BODY_HASHES: Record<LegalDocKey, Record<string, string>> = {
    TERMS: {
        // 2026-09-06 개정 — 취소·환불 정책 페이지 반영 (#52)
        "2026-09-06": "f68c948cd62004b3",
    },
    PRIVACY: {
        // 2026-09-06 개정 — 파트너 정산정보, 제11조 조문 번호 (#104)
        "2026-09-06": "620b22059468154f",
    },
};

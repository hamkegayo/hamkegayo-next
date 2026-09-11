// 약관·방침 버전 무결성 검사 (#105) — DB 없이 순수 데이터만 본다.
//
// 실행:
//   npm run test:legal
//
// 무엇을 지키려는 검사인가
//   `user_agreements` 는 동의한 문서의 `version` 문자열만 저장한다. 그래서
//   **본문이 바뀌었는데 version 이 그대로면 동의 이력이 본문을 식별하지 못한다.**
//
//   실제로 일어난 일이다. 2026-09-06 개정에서 두 문서 모두 본문이 바뀌었는데
//   version 은 시행일 ISO 라 그대로였다. 개정 전에 동의한 사람과 개정 후에
//   동의한 사람의 기록이 같아졌고, unique 제약 때문에 재동의 행도 들어가지
//   않았다 (#105 · #91).
//
//   버전을 올리는 것은 사람이 하고, 사람은 잊는다. 여기서 대조한다.

import { createHash } from "node:crypto";

import { TERMS } from "@/lib/legal/terms";
import { PRIVACY } from "@/lib/legal/privacy";
import { LEGAL_BODY_HASHES } from "@/lib/legal/versions";
import { AGREEMENT_VERSION } from "@/lib/legal/agreements";

const DOCS = [
    { key: "TERMS", doc: TERMS },
    { key: "PRIVACY", doc: PRIVACY },
];

/** 조문 데이터만 해싱한다 — 주석·서식·표기 변경에는 흔들리지 않는다 */
function bodyHash(doc) {
    return createHash("sha256")
        .update(JSON.stringify(doc.articles))
        .digest("hex")
        .slice(0, 16);
}

let passed = 0;
let failed = 0;
function check(name, ok, extra = "") {
    if (ok) {
        passed++;
        console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    } else {
        failed++;
        console.log(
            `  \x1b[31mFAIL\x1b[0m  ${name}${extra ? `\n        ${extra}` : ""}`,
        );
    }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

console.log("\n[1] 버전 표기");
for (const { key, doc } of DOCS) {
    check(
        `${key} version 이 ISO 날짜다 (${doc.version})`,
        ISO.test(doc.version),
    );
    check(`${key} revisedDate 가 있다`, !!doc.revisedDate);
    check(`${key} effectiveDate 가 있다`, !!doc.effectiveDate);
}

console.log("\n[2] 본문 해시 — 버전을 올리지 않은 개정을 잡는다");
for (const { key, doc } of DOCS) {
    const actual = bodyHash(doc);
    const declared = LEGAL_BODY_HASHES[key]?.[doc.version];

    check(
        `${key} version ${doc.version} 의 해시가 등록돼 있다`,
        !!declared,
        declared
            ? ""
            : `lib/legal/versions.ts 의 ${key} 에 아래를 추가할 것\n          "${doc.version}": "${actual}",`,
    );

    if (declared) {
        check(
            `${key} 본문이 등록된 해시와 일치한다`,
            declared === actual,
            declared === actual
                ? ""
                : `본문이 바뀌었다. version 을 개정일로 올리고 새 해시를 추가할 것\n          현재 본문 해시 : ${actual}\n          등록된 해시    : ${declared}`,
        );
    }
}

console.log("\n[3] 동의 이력 연결");
check(
    "SERVICE 버전이 이용약관을 가리킨다",
    AGREEMENT_VERSION.SERVICE === TERMS.version,
);
for (const type of ["PRIVACY", "PERSONAL", "SENSITIVE"]) {
    check(
        `${type} 버전이 처리방침을 가리킨다`,
        AGREEMENT_VERSION[type] === PRIVACY.version,
    );
}

// 과거 버전 기록이 지워지지 않았는지 — 그 표가 곧 개정 이력이다
console.log("\n[4] 이력 보존");
for (const { key } of DOCS) {
    const versions = Object.keys(LEGAL_BODY_HASHES[key] ?? {});
    check(
        `${key} 에 등록된 버전이 있다 (${versions.length}건)`,
        versions.length > 0,
    );
}

console.log(
    `\n${failed === 0 ? "🎉" : "⚠️"}  ${passed}건 통과 / ${failed}건 실패`,
);
process.exit(failed === 0 ? 0 : 1);

// 알림·리다이렉트 링크가 실제 라우트를 가리키는지 검사한다.
//
// 실행:
//   npm run check:links
//
// 왜 필요한가
//   알림 링크는 **누가 누르기 전까지 아무도 모른다.** 타입 검사도 빌드도
//   통과하고, 테스트는 알림 본문만 보지 링크를 따라가지 않는다.
//   실제로 파트너 도착 알림이 없는 라우트(/mypage/reservations)를 가리켜
//   프로덕션에서 404 가 났다 — 목록은 /mypage 가 보여주고 예약별 상세만
//   [id] 로 있는데 그 사이를 가리키고 있었다.
//
// 무엇을 보는가
//   createNotification 의 link, redirect(), router.push() 의 내부 경로.
//   외부 URL(http…)과 쿼리·해시만 붙은 것은 건너뛴다.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "app");

// ---------------------------------------------------------------
// 1. 라우트 목록 — app/**/page.tsx 에서 URL 을 복원한다
// ---------------------------------------------------------------
/** 라우트 그룹 `(user)` 과 병렬 라우트 `@slot` 은 URL 에 나타나지 않는다. */
function isInvisible(segment) {
    return /^\(.*\)$/.test(segment) || segment.startsWith("@");
}

function collectRoutes(dir, acc = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            collectRoutes(full, acc);
        } else if (name === "page.tsx" || name === "page.ts") {
            const rel = relative(APP, full).split(sep).slice(0, -1);
            const url = "/" + rel.filter((s) => !isInvisible(s)).join("/");
            acc.push(url === "/" ? "/" : url.replace(/\/$/, ""));
        }
    }
    return acc;
}

const routes = collectRoutes(APP);

/** 라우트 한 개가 주어진 경로를 받아낼 수 있는가 */
function matches(route, path) {
    const r = route.split("/").filter(Boolean);
    const p = path.split("/").filter(Boolean);

    for (let i = 0; i < r.length; i += 1) {
        const seg = r[i];
        if (seg.startsWith("[...") || seg.startsWith("[[...")) return true;
        if (i >= p.length) return false;
        // [id] 는 어떤 값이든 받는다. 링크 쪽 `${...}` 도 마찬가지다.
        if (seg.startsWith("[")) continue;
        if (seg !== p[i]) return false;
    }
    return r.length === p.length;
}

// ---------------------------------------------------------------
// 2. 코드에서 링크를 모은다
// ---------------------------------------------------------------
const TARGET_DIRS = ["app", "lib", "components", "utils"];
const PATTERNS = [
    // createNotification({ ... link: "..." })
    /\blink:\s*(["'`])([^"'`]+)\1/g,
    // redirect("/...") · router.push("/...") · router.replace("/...")
    /\b(?:redirect|router\.push|router\.replace)\(\s*(["'`])(\/[^"'`]*)\1/g,
];

function walk(dir, acc = []) {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, acc);
        else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
    }
    return acc;
}

const files = TARGET_DIRS.flatMap((d) => {
    try {
        return walk(join(ROOT, d));
    } catch {
        return [];
    }
});

const found = [];
for (const file of files) {
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (const re of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
            const raw = m[2];
            if (!raw.startsWith("/")) continue; // 외부 URL·상대경로
            const line = src.slice(0, m.index).split("\n").length;
            found.push({
                file: relative(ROOT, file),
                line,
                raw,
                text: lines[line - 1]?.trim() ?? "",
            });
        }
    }
}

// ---------------------------------------------------------------
// 3. 대조
// ---------------------------------------------------------------
let bad = 0;
const seen = new Set();

for (const link of found) {
    // 쿼리·해시를 떼고, 템플릿 자리(`${...}`)는 하나의 값으로 본다.
    const path = link.raw
        .split("?")[0]
        .split("#")[0]
        .replace(/\$\{[^}]*\}/g, "_id_");

    if (routes.some((r) => matches(r, path))) continue;

    bad += 1;
    const key = `${link.file}:${link.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${link.raw}`);
    console.log(`        ${link.file}:${link.line}`);
}

console.log(
    `\n라우트 ${routes.length}개 · 링크 ${found.length}개 검사` +
        (bad === 0 ? " — \x1b[32m모두 유효\x1b[0m" : ""),
);

if (bad > 0) {
    console.log(
        `\n\x1b[31m${bad}건이 존재하지 않는 라우트를 가리킵니다.\x1b[0m`,
    );
    process.exit(1);
}

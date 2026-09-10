/**
 * `@/` 별칭을 프로젝트 루트로 풀어주는 resolve 훅.
 *
 *  Node 의 타입 스트리핑(--experimental-strip-types)은 tsconfig 의 paths 를
 *  읽지 않는다. 그래서 `@/lib/pricing` 같은 import 가 그대로는 풀리지 않고,
 *  순수 계산 모듈조차 단위 테스트를 붙일 수 없었다.
 *
 *  확장자도 함께 채운다 — 스트리핑 모드는 확장자 생략을 허용하지 않는데
 *  애플리케이션 코드는 번들러 기준으로 생략해서 쓴다.
 */
import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

/** 확장자 없는 경로에 붙여볼 후보 (순서가 곧 우선순위) */
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** 이미 확장자가 붙어 있는가 — 붙어 있으면 손대지 않는다 */
const HAS_EXT = /\.[cm]?[jt]sx?$/;

async function firstExisting(base) {
    for (const suffix of CANDIDATES) {
        const path = base + suffix;
        try {
            await access(path);
            return path;
        } catch {
            // 다음 후보
        }
    }
    return null;
}

/** 찾은 경로를 TS 모듈로 확정해 돌려준다 */
function asTsModule(path) {
    return {
        url: pathToFileURL(path).href,
        // TS 전용 포맷을 명시한다. 생략하면 Node 가 CommonJS 로 먼저 파싱해보고
        // 실패한 뒤 ESM 으로 다시 읽는다(경고 + 성능 손해).
        format: "module-typescript",
        shortCircuit: true,
    };
}

export async function resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
        const found = await firstExisting(
            resolvePath(ROOT, specifier.slice(2)),
        );
        if (found) return asTsModule(found);
    }

    // 상대 경로도 확장자를 채운다.
    //  `lib/legal/terms.ts` 는 `./types` · `./company` 처럼 확장자 없이 가져온다.
    //  이걸 못 풀면 별칭만 처리해서는 해당 모듈을 테스트에서 열 수 없다.
    if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !HAS_EXT.test(specifier) &&
        context.parentURL?.startsWith("file:")
    ) {
        const base = resolvePath(
            dirname(fileURLToPath(context.parentURL)),
            specifier,
        );
        const found = await firstExisting(base);
        if (found) return asTsModule(found);
    }

    return next(specifier, context);
}

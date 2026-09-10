// 시드 스크립트가 어느 Supabase 프로젝트를 건드리는지 판정한다 (#114).
//
// 왜 필요한가
//   원래 가드는 "localhost 가 아니면 중단" 이었다. 사고는 막지만
//   **스테이징에도 시드를 넣을 수 없다.** 스테이징이 생기면서 허용 목록
//   방식은 더 못 쓴다 — 환경이 하나 늘 때마다 스크립트를 고쳐야 한다.
//
// 그래서 뒤집었다. 원격은 기본 차단이되, **대상 프로젝트 ref 를 직접
// 타이핑해야** 열린다. `.env.local` 이 몰래 운영을 가리키고 있어도
// 스테이징 ref 를 적었다면 불일치로 멈춘다 — 이것이 핵심이다.
//
//   로컬      : npm run seed:dev
//   스테이징  : SEED_TARGET_REF=<스테이징_ref> npm run seed:dev
//
// ref 는 Supabase 프로젝트 URL 의 서브도메인이다.
//   https://abcdefghijklmnop.supabase.co  →  abcdefghijklmnop

/**
 * 절대 시드를 넣지 않을 프로젝트 ref.
 *
 * `SEED_TARGET_REF` 를 정확히 맞게 적어도 여기 있는 ref 는 차단된다.
 * ref 확인 대조를 통과한 뒤 마지막으로 걸리는 그물이다 — 운영 ref 를 그대로
 * 타이핑해 버리는 경우까지 막는다.
 *
 * ⚠️ ref 는 비밀이 아니다. 프로젝트 URL(`https://<ref>.supabase.co`)이
 *    `NEXT_PUBLIC_SUPABASE_URL` 이라 이미 브라우저 번들에 들어 있다.
 *
 *   scpczxkcmnpubtmnqkem — 운영 (Supabase 프로젝트 `hamkegayo-next`)
 */
const BLOCKED_REFS = ["scpczxkcmnpubtmnqkem"];

const LOCAL_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/;

/** Supabase URL 에서 프로젝트 ref 를 뽑는다. 로컬이거나 형식이 다르면 null. */
export function projectRef(url) {
    const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i.exec(url ?? "");
    return m ? m[1] : null;
}

/**
 * 시드 대상이 안전한지 확인한다. 아니면 이유를 출력하고 프로세스를 끝낸다.
 *
 * @param {string|undefined} url  NEXT_PUBLIC_SUPABASE_URL
 * @param {string} scriptName     안내 문구에 쓸 스크립트 이름
 * @returns {"local"|"remote"}    통과한 대상 종류
 */
export function assertSeedTarget(url, scriptName) {
    if (!url) {
        console.error("❌ NEXT_PUBLIC_SUPABASE_URL 이 없습니다.");
        process.exit(1);
    }

    if (LOCAL_RE.test(url)) return "local";

    const ref = projectRef(url);
    const allow = process.env.SEED_TARGET_REF?.trim();

    if (!ref) {
        console.error(
            "❌ 로컬도 아니고 Supabase 프로젝트 URL 도 아닙니다. 중단합니다.",
        );
        console.error(`   현재 URL: ${url}`);
        process.exit(1);
    }

    if (BLOCKED_REFS.includes(ref)) {
        console.error(`❌ 차단된 프로젝트입니다 (${ref}). 중단합니다.`);
        console.error(
            "   scripts/_target-guard.mjs 의 BLOCKED_REFS 에 등록돼 있습니다.",
        );
        process.exit(1);
    }

    if (allow !== ref) {
        console.error(
            "❌ 원격 프로젝트입니다. 대상을 직접 지정해야 실행됩니다.",
        );
        console.error(`   현재 URL 의 ref : ${ref}`);
        console.error(
            `   SEED_TARGET_REF : ${allow ? `${allow} (불일치)` : "지정되지 않음"}`,
        );
        console.error("");
        console.error("   맞는 대상이라면 ref 를 직접 적어 다시 실행하세요.");
        console.error(
            `     SEED_TARGET_REF=${ref} node --env-file=.env.local scripts/${scriptName}`,
        );
        console.error("");
        console.error(
            "   ⚠️ 적기 전에 그 ref 가 스테이징이 맞는지 확인하세요.",
        );
        console.error("      .env.local 이 운영을 가리키고 있을 수 있습니다.");
        process.exit(1);
    }

    console.log(`⚠️  원격 프로젝트에 시드합니다 — ref ${ref}`);
    return "remote";
}

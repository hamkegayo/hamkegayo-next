import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { safeInternalPath, SOCIAL_PROVIDERS } =
    await import("../lib/auth/social.ts");

assert.equal(SOCIAL_PROVIDERS.kakao, "kakao");
assert.equal(SOCIAL_PROVIDERS.naver, "custom:naver");

assert.equal(safeInternalPath(undefined), "/");
assert.equal(safeInternalPath("/reservation?step=2"), "/reservation?step=2");
assert.equal(safeInternalPath("//evil.example/path"), "/");
assert.equal(safeInternalPath("https://evil.example/path"), "/");
assert.equal(safeInternalPath("javascript:alert(1)"), "/");

const migration = readFileSync(
    new URL(
        "../supabase/migrations/20260708000060_social_signup.sql",
        import.meta.url,
    ),
    "utf8",
);

assert.match(migration, /from auth\.users u/);
assert.match(migration, /from auth\.identities i/);
assert.match(migration, /lower\(trim\(p_email\)\) <> v_auth_email/);
assert.match(migration, /insert into public\.profiles/);
assert.match(migration, /insert into public\.user_agreements/);
assert.match(
    migration,
    /revoke all on function public\.complete_social_signup/,
);
assert.match(
    migration,
    /grant execute on function public\.complete_social_signup[\s\S]*to service_role/,
);

console.log("social auth tests passed");

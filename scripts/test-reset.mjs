// 비밀번호 재설정 재현 테스트 (#127).
//
// 실행 (Node 20.6+):
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) node --env-file=.env.local scripts/test-reset.mjs
//
// 대상 가드: scripts/_target-guard.mjs 를 쓴다.
//   로컬은 그냥 통과하고, 원격은 SEED_TARGET_REF 에 대상 ref 를 직접 적어야
//   열리며, 운영 ref 는 적어도 차단된다.
//
// 격리: **공용 시드 계정을 건드리지 않는다.** 매번 일회용 계정을 만들어 쓰고
//   끝나면 지운다. 비밀번호를 바꿨다가 되돌리는 방식은 도중에 죽으면 계정이
//   바뀐 채 남는다 — 팀이 공유하는 스테이징 계정에서 그러면 안 된다.
//
// 무엇을 지키려는 테스트인가
//   재설정은 **계정을 빼앗겼을 때 되찾는 경로**다. 그래서 확인할 것은
//   "바꿔지는가" 가 아니라 아래 셋이다.
//     1. 남의 계정을 열 수 없는가   — 대상 판별 (파트너·미가입·비활성)
//     2. 코드가 한 번만 쓰이는가     — 소비 후 재사용 차단
//     3. **기존 세션이 죽는가**      — 탈취범이 이미 로그인해 있던 기기
//
//   3번은 Supabase GoTrue 가 관리자 비밀번호 변경 시 자동으로 처리한다.
//   우리 코드가 아니라 플랫폼 동작이라 **조용히 사라질 수 있다.** 여기서
//   못 박아 둔다.

import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";

import { assertSeedTarget } from "./_target-guard.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
    console.error("❌ SUPABASE URL / SERVICE_ROLE / ANON 키가 필요합니다.");
    process.exit(1);
}

assertSeedTarget(url, "test-reset.mjs");

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
});

/** 이 스크립트가 만든 것만 지운다 */
const EMAIL = "reset-test-127@example.com";
const OLD_PW = "reset-old-1!";
const NEW_PW = "reset-new-2!";

const hash = (c) => createHash("sha256").update(c).digest("hex");

let passed = 0;
let failed = 0;
function check(name, ok, extra = "") {
    if (ok) {
        passed++;
        console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    } else {
        failed++;
        console.log(
            `  \x1b[31mFAIL\x1b[0m  ${name}${extra ? ` — ${extra}` : ""}`,
        );
    }
}

/** 액션의 findResettableUser 와 같은 판정 */
async function findResettable(email) {
    const { data } = await admin
        .from("profiles")
        .select("id, role, status")
        .eq("email", email)
        .eq("role", "USER")
        .maybeSingle();
    if (!data || data.status !== "ACTIVE") return null;
    return { id: data.id };
}

async function findAuthUser(email) {
    const { data } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
    });
    return data.users.find((u) => u.email === email) ?? null;
}

async function cleanup() {
    await admin.from("email_verifications").delete().eq("email", EMAIL);
    const u = await findAuthUser(EMAIL);
    if (u) {
        await admin.from("profiles").delete().eq("id", u.id);
        await admin.auth.admin.deleteUser(u.id);
    }
}

async function login(email, password) {
    const c = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await c.auth.signInWithPassword({
        email,
        password,
    });
    return error ? null : data.session;
}

async function main() {
    await cleanup();

    // ── 일회용 계정
    const { data: made, error: mkErr } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: OLD_PW,
        email_confirm: true,
    });
    if (mkErr || !made?.user)
        throw new Error(`계정 생성 실패: ${mkErr?.message}`);
    const uid = made.user.id;
    await admin.from("profiles").insert({
        id: uid,
        role: "USER",
        name: "재설정테스트",
        email: EMAIL,
        phone: "01000000127",
        status: "ACTIVE",
    });

    console.log("\n[1] 대상 판별 — 남의 계정을 열 수 없어야 한다");
    check("일반 회원(USER)은 재설정 대상", !!(await findResettable(EMAIL)));
    check(
        "파트너 합성 이메일은 대상 아님",
        !(await findResettable("partner01@partner.hamkegayo.internal")),
    );
    check(
        "미가입 주소는 대상 아님",
        !(await findResettable("nobody-127@example.com")),
    );

    await admin.from("profiles").update({ status: "WITHDRAWN" }).eq("id", uid);
    check("탈퇴 계정은 대상 아님", !(await findResettable(EMAIL)));
    await admin.from("profiles").update({ status: "ACTIVE" }).eq("id", uid);

    console.log("\n[2] 코드 검증 경계");
    const code = String(randomInt(0, 1e6)).padStart(6, "0");
    await admin.from("email_verifications").insert({
        email: EMAIL,
        code_hash: hash(code),
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    const liveRow = async () =>
        (
            await admin
                .from("email_verifications")
                .select("id, code_hash, expires_at, attempts")
                .eq("email", EMAIL)
                .is("consumed_at", null)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
        ).data;

    const row = await liveRow();
    check("틀린 코드는 해시가 어긋난다", row.code_hash !== hash("000000"));
    check("맞는 코드는 해시가 일치한다", row.code_hash === hash(code));

    console.log("\n[3] 기존 세션 — 탈취범이 이미 로그인해 있던 기기");
    const session = await login(EMAIL, OLD_PW);
    check("변경 전 로그인 성공", !!session);
    const access = session.access_token;
    const refresh = session.refresh_token;

    const accessTokenWorks = async () => {
        const r = await fetch(`${url}/auth/v1/user`, {
            headers: { apikey: anonKey, Authorization: `Bearer ${access}` },
        });
        return r.ok;
    };
    check("변경 전 access token 은 유효", await accessTokenWorks());

    // ── 실제 재설정 (액션과 같은 순서)
    await admin
        .from("email_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);
    const { error: updErr } = await admin.auth.admin.updateUserById(uid, {
        password: NEW_PW,
    });
    check("비밀번호 변경 성공", !updErr, updErr?.message ?? "");

    check("새 비밀번호로 로그인된다", !!(await login(EMAIL, NEW_PW)));
    check("옛 비밀번호는 거부된다", !(await login(EMAIL, OLD_PW)));

    // 여기가 이 스크립트의 핵심이다.
    check("변경 후 기존 access token 이 거부된다", !(await accessTokenWorks()));

    const refreshed = await createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    }).auth.refreshSession({ refresh_token: refresh });
    check("변경 후 기존 refresh token 이 거부된다", !!refreshed.error);

    console.log("\n[4] 코드 재사용 차단");
    check("소비된 코드는 다시 조회되지 않는다", (await liveRow()) === null);

    await cleanup();
}

main()
    .then(() => {
        console.log(
            `\n${failed === 0 ? "🎉" : "⚠️"}  ${passed}건 통과 / ${failed}건 실패`,
        );
        process.exit(failed === 0 ? 0 : 1);
    })
    .catch(async (e) => {
        console.error("\n❌ 실행 실패:", e.message);
        await cleanup().catch(() => {});
        process.exit(1);
    });

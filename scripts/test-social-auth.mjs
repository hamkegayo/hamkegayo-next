import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, mock } from "node:test";

import {
    isSocialProviderEnabled,
    safeInternalPath,
    SOCIAL_PROVIDERS,
} from "@/lib/auth/social.ts";
import { authPageWithNext } from "@/lib/auth/navigation.ts";

import { getNaverUserinfo } from "@/lib/auth/naver-userinfo.ts";
import {
    knownOAuthError,
    oauthErrorFromLocation,
    providerOAuthError,
} from "@/lib/auth/oauth-errors.ts";

test("예약 복귀 경로를 일반 로그인 → 회원가입 → 가입 완료 로그인까지 유지한다", () => {
    for (const destination of ["/reservation", "/reservation?step=2&plan=plus#partner"]) {
        const signup = new URL(authPageWithNext("/signup", destination), "https://www.hamkegayo.kr");
        assert.equal(signup.pathname, "/signup");
        const login = new URL(authPageWithNext("/login", signup.searchParams.get("next")), "https://www.hamkegayo.kr");
        assert.equal(login.pathname, "/login");
        assert.equal(safeInternalPath(login.searchParams.get("next")), destination);
    }
});

test("회원가입 경유 복귀도 외부 URL을 거절하고 기본 인증 화면 경로를 유지한다", () => {
    for (const next of [undefined, "/", "//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)"]) {
        assert.equal(authPageWithNext("/signup", next), "/signup");
        assert.equal(authPageWithNext("/login", next), "/login");
    }
});

test("기존 제공자 식별자와 내부 리디렉션 검증을 유지한다", () => {
    assert.equal(SOCIAL_PROVIDERS.kakao, "kakao");
    assert.equal(SOCIAL_PROVIDERS.naver, "custom:naver");
    assert.equal(safeInternalPath(undefined), "/");
    assert.equal(
        safeInternalPath("/reservation?step=2"),
        "/reservation?step=2",
    );
    assert.equal(safeInternalPath("//evil.example/path"), "/");
    assert.equal(safeInternalPath("https://evil.example/path"), "/");
    assert.equal(safeInternalPath("javascript:alert(1)"), "/");
});

test("네이버 로그인은 환경변수가 정확히 true일 때만 켜진다", async (t) => {
    const key = "NEXT_PUBLIC_NAVER_LOGIN_ENABLED";
    const saved = process.env[key];
    t.after(() => {
        if (saved === undefined) delete process.env[key];
        else process.env[key] = saved;
    });
    for (const [value, enabled] of [
        [undefined, false],
        ["", false],
        ["false", false],
        ["1", false],
        ["TRUE", false],
        ["true", true],
    ]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        // 모듈 상수는 로드 때 정해지므로 값마다 새로 불러온다.
        const social = await import(
            new URL(
                `../lib/auth/social.ts?env=${value ?? "unset"}`,
                import.meta.url,
            ).href
        );
        assert.equal(social.NAVER_LOGIN_ENABLED, enabled, String(value));
    }
});

test("카카오는 항상 열고 네이버는 플래그를 켠 경우에만 연다", () => {
    assert.equal(isSocialProviderEnabled("kakao", false), true);
    assert.equal(isSocialProviderEnabled("kakao", true), true);
    assert.equal(isSocialProviderEnabled("naver", false), false);
    assert.equal(isSocialProviderEnabled("naver", true), true);
});

test("로그인 화면의 네이버 시작 가드·버튼 비활성·문구가 같은 판정을 쓴다", () => {
    const form = readFileSync(
        new URL("../app/(user)/login/_components/login-form.tsx", import.meta.url),
        "utf8",
    );
    assert.doesNotMatch(form, /NAVER_LOGIN_ENABLED/);
    assert.ok(form.includes("if (!isSocialProviderEnabled(provider)) return;"));
    assert.match(form, /disabled=\{\s*!isSocialProviderEnabled\("naver"\) \|\|/);
    assert.match(form, /\{isSocialProviderEnabled\("naver"\)\s*\? "네이버 로그인"/);
});

test("userinfo 라우트는 요청만 넘겨 컨텍스트가 플래그로 읽히지 않는다", () => {
    const route = readFileSync(
        new URL("../app/api/auth/naver/userinfo/route.ts", import.meta.url),
        "utf8",
    );
    assert.ok(
        route.includes(
            "GET = (request: Request) => getNaverUserinfo(request)",
        ),
    );
    assert.ok(!route.includes("GET = getNaverUserinfo;"));
});

test("기존 소셜 가입 RPC의 이메일 검증·권한 경계를 유지한다", () => {
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
});

const token = "test/Token+Value==";
const request = (authorization = `Bearer ${token}`) =>
    new Request("https://example.com/api/auth/naver/userinfo", {
        headers: authorization ? { Authorization: authorization } : {},
    });
// 네이버 로그인을 켠 환경의 동작을 검사한다. 꺼진 환경은 아래에서 따로 본다.
const userinfo = (req) => getNaverUserinfo(req, true);
const profile = (response = {}) => ({
    resultcode: "00",
    response: { id: "naver-user-id", email: "member@example.com", ...response },
});

test("네이버 중첩 프로필은 필요한 최상위 claims만 반환한다", async (t) => {
    const fetchMock = mock.method(globalThis, "fetch", async (url, options) => {
        assert.equal(url, "https://openapi.naver.com/v1/nid/me");
        assert.equal(options.headers.Authorization, `Bearer ${token}`);
        assert.equal(options.cache, "no-store");
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        return Response.json(
            profile({
                name: "회원",
                mobile: "010-secret",
                profile_image: "https://example.com/photo",
            }),
        );
    });
    t.after(() => fetchMock.mock.restore());
    const response = await userinfo(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
        sub: "naver-user-id",
        email: "member@example.com",
        name: "회원",
    });
});

test("네이버 로그인을 켜지 않은 환경은 네이버 API를 호출하지 않고 503으로 거절한다", async (t) => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
        throw new Error("must not call");
    });
    t.after(() => fetchMock.mock.restore());
    for (const response of [
        await getNaverUserinfo(request(), false),
        // 테스트 환경은 플래그를 주지 않으므로 기본값도 꺼짐이어야 한다.
        await getNaverUserinfo(request()),
    ]) {
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.ok(!(await response.text()).includes(token));
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("토큰이 없거나 잘못되면 네이버 API를 호출하지 않는다", async (t) => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
        throw new Error("must not call");
    });
    t.after(() => fetchMock.mock.restore());
    for (const authorization of [
        "",
        "Basic fake",
        "Bearer invalid token",
        `Bearer ${"a".repeat(4096)}`,
    ]) {
        const response = await userinfo(request(authorization));
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("이메일 미제공을 임의 주소나 인증 완료로 채우지 않는다", async (t) => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
        Response.json(profile({ email: undefined })),
    );
    t.after(() => fetchMock.mock.restore());
    const response = await userinfo(request());
    assert.deepEqual(await response.json(), { sub: "naver-user-id" });
});

test("naver.com 주소만 검증된 이메일로 알리고 외부·유사 도메인은 미검증으로 둔다", async (t) => {
    let email;
    const fetchMock = mock.method(globalThis, "fetch", async () =>
        Response.json(profile({ email })),
    );
    t.after(() => fetchMock.mock.restore());
    for (const [value, verified] of [
        ["member@naver.com", true],
        ["Member@NAVER.COM", true],
        ["member@example.com", false],
        ["member@gmail.com", false],
        ["member@sub.naver.com", false],
        ["member@navercom.com", false],
        ["member@evilnaver.com", false],
        ["member@naver.com.evil.example", false],
    ]) {
        email = value;
        const body = await (await userinfo(request())).json();
        assert.equal(body.email, value);
        assert.equal(body.email_verified, verified ? true : undefined, value);
    }
});

test("네이버 오류·유효하지 않은 응답·네트워크 장애는 개인정보 없이 거절한다", async (t) => {
    let upstream;
    const fetchMock = mock.method(globalThis, "fetch", async () => {
        if (upstream instanceof Error) throw upstream;
        return upstream;
    });
    t.after(() => fetchMock.mock.restore());
    for (const [result, status] of [
        [Response.json({ secret: token }, { status: 401 }), 401],
        [Response.json({ secret: token }, { status: 403 }), 401],
        [Response.json({ secret: token }, { status: 500 }), 502],
        [Response.json(profile({ id: "" })), 502],
        [Response.json(profile({ email: "invalid" })), 502],
        [
            Response.json({ resultcode: "024", response: profile().response }),
            502,
        ],
        [new Response("not-json"), 502],
        [new Error(`provider secret ${token}`), 502],
    ]) {
        upstream = result;
        const response = await userinfo(request());
        assert.equal(response.status, status);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const body = await response.text();
        assert.ok(!body.includes(token));
        assert.ok(!body.includes("member@example.com"));
    }
});

test("Supabase 이메일 오류 fragment가 missing_code보다 우선한다", () => {
    const hash =
        "#error=server_error&error_code=unexpected_failure&error_description=Error+getting+user+email+from+external+provider";
    assert.equal(
        oauthErrorFromLocation("?oauth_error=missing_code", hash),
        "email_required",
    );
    assert.equal(
        providerOAuthError(new URLSearchParams(hash.slice(1))),
        "email_required",
    );
    assert.equal(
        oauthErrorFromLocation("?error_code=email_address_not_provided", ""),
        "email_required",
    );
});

test("취소·일반 오류·알 수 없는 오류는 정해진 안내 코드만 사용한다", () => {
    assert.equal(
        oauthErrorFromLocation(
            "",
            "#error=provider_email_needs_verification&error_code=provider_email_needs_verification",
        ),
        "email_verification_required",
    );
    assert.equal(
        oauthErrorFromLocation("", "#error=access_denied"),
        "access_denied",
    );
    assert.equal(
        oauthErrorFromLocation(
            "?error=server_error&error_description=secret",
            "",
        ),
        "provider_failed",
    );
    assert.equal(knownOAuthError("constructor"), "provider_failed");
    assert.equal(knownOAuthError("exchange_failed"), "exchange_failed");
    assert.equal(oauthErrorFromLocation("", "#unrelated=1"), null);
});

test("Supabase access_denied와 함께 온 구체적인 이메일 오류를 우선한다", () => {
    for (const [code, expected] of [
        ["provider_email_needs_verification", "email_verification_required"],
        ["over_email_send_rate_limit", "email_rate_limited"],
        ["email_address_not_provided", "email_required"],
        ["user_banned", "account_unavailable"],
        ["signup_disabled", "provider_failed"],
        ["unknown_code", "provider_failed"],
    ]) {
        const params = `error=access_denied&error_code=${code}`;
        assert.equal(providerOAuthError(new URLSearchParams(params)), expected);
        assert.equal(oauthErrorFromLocation(`?${params}`, ""), expected);
        assert.equal(knownOAuthError(expected), expected);
        assert.equal(
            oauthErrorFromLocation("?oauth_error=missing_code", `#${params}`),
            expected,
        );
    }
    assert.equal(
        providerOAuthError(new URLSearchParams("error=access_denied")),
        "access_denied",
    );
});

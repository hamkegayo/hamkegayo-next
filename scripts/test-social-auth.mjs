import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, mock } from "node:test";

import { safeInternalPath, SOCIAL_PROVIDERS } from "@/lib/auth/social.ts";

import { getNaverUserinfo } from "@/lib/auth/naver-userinfo.ts";
import {
    knownOAuthError,
    oauthErrorFromLocation,
    providerOAuthError,
} from "@/lib/auth/oauth-errors.ts";

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
    const response = await getNaverUserinfo(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
        sub: "naver-user-id",
        email: "member@example.com",
        name: "회원",
    });
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
        const response = await getNaverUserinfo(request(authorization));
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
    const response = await getNaverUserinfo(request());
    assert.deepEqual(await response.json(), { sub: "naver-user-id" });
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
        const response = await getNaverUserinfo(request());
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

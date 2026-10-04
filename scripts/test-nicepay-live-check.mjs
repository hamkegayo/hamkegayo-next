import assert from "node:assert/strict";
import { test } from "node:test";
import { checkNicepayLive } from "./check-nicepay-live.mjs";

const env = {
    NEXT_PUBLIC_NICEPAY_CLIENT_KEY: "R2_test_only",
    NICEPAY_SECRET_KEY: "fake-secret",
};

test("운영 조회 검증은 고정 호스트의 GET만 호출한다", async () => {
    let calls = 0;
    const result = await checkNicepayLive(env, async (url, options) => {
        calls++;
        assert.match(
            url,
            /^https:\/\/api\.nicepay\.co\.kr\/v1\/payments\/find\/release-check-[\da-f-]+\?orderDate=\d{8}$/,
        );
        assert.equal(options.method, "GET");
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(options.body, undefined);
        assert.equal(
            options.headers.Authorization,
            `Basic ${Buffer.from("R2_test_only:fake-secret").toString("base64")}`,
        );
        return Response.json({ resultCode: "U107" }, { status: 404 });
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { http: 404, resultCode: "U107", readOnly: true });
});

test("테스트키·누락된 키는 운영 API를 호출하지 않는다", async () => {
    for (const invalid of [
        {},
        { ...env, NEXT_PUBLIC_NICEPAY_CLIENT_KEY: "S2_test" },
        { ...env, NICEPAY_SECRET_KEY: "" },
    ]) {
        let called = false;
        await assert.rejects(
            checkNicepayLive(invalid, async () => {
                called = true;
            }),
        );
        assert.equal(called, false);
    }
});

test("인증 실패·거래 성공·알 수 없는 응답을 인증 성공으로 오판하지 않는다", async () => {
    for (const [status, resultCode] of [
        [401, "U304"],
        [200, "U304"],
        [200, "0000"],
        [200, "unknown"],
        [500, "U126"],
    ]) {
        await assert.rejects(
            checkNicepayLive(env, async () =>
                Response.json(
                    { resultCode, secret: "fake-secret" },
                    { status },
                ),
            ),
            (error) => !error.message.includes("fake-secret"),
        );
    }
    await assert.rejects(
        checkNicepayLive(env, async () => {
            throw new Error("fake-secret");
        }),
        (error) => !error.message.includes("fake-secret"),
    );
});

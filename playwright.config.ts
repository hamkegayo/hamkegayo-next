import { defineConfig, devices } from "@playwright/test";

// 브라우저 E2E(계층 4, #214). 로컬 Supabase + 모의 PG 위에서 핵심 흐름만 검증한다.
// 실제 NICEPAY·메일은 호출하지 않는다 — 테스트 가이드(Notion) https://app.notion.com/p/3f1169f76f9f819ca52ef036622c3fc1
/**
 * 신규 방식(선결제 후 운영자 직접 배정, #300) 피처 플래그. `NEXT_PUBLIC_` 값은 빌드에 인라인되고
 * 서버 하나는 한 값만 가지므로, 기존 흐름(꺼짐)과 신규 흐름(켜짐)을 서버를 따로 띄워 두 번 실행한다.
 * `npm run test:e2e` 가 두 번을 모두 돌린다 (scripts/run-e2e.mjs).
 */
export const DIRECT_FLOW = process.env.E2E_DIRECT_FLOW === "1";
const PORT = DIRECT_FLOW ? 3101 : 3100;
const BASE_URL = `http://localhost:${PORT}`;
const CI = !!process.env.CI;

/** 결제 모의용 값. 샌드박스 키 접두사(S2_)여야 루프백 PG 주소가 허용된다. */
export const E2E_PAYMENT = {
    clientKey: "S2_e2e_client",
    secretKey: "e2e-secret-key",
    apiBase: "http://127.0.0.1:4010",
} as const;

export default defineConfig({
    testDir: "./e2e",
    // e2e/support/__tests__ 의 *.test.ts 는 Vitest 단위 테스트다. 스펙만 수집한다.
    // 플래그 꺼짐 실행은 기존 흐름 스펙, 켜짐 실행은 direct-*.spec.ts 만 수집한다.
    testMatch: DIRECT_FLOW ? "**/direct-*.spec.ts" : "**/*.spec.ts",
    testIgnore: DIRECT_FLOW ? [] : "**/direct-*.spec.ts",
    globalSetup: "./e2e/support/global-setup.ts",
    globalTeardown: "./e2e/support/global-teardown.ts",
    // 여러 역할이 같은 예약을 순서대로 다루므로 직렬로 실행한다.
    fullyParallel: false,
    workers: 1,
    retries: CI ? 1 : 0,
    timeout: 120_000,
    expect: { timeout: 15_000 },
    forbidOnly: CI,
    reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
    use: {
        baseURL: BASE_URL,
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: [
        {
            command: "node e2e/support/mock-address.mjs",
            url: "http://127.0.0.1:4011/health",
            reuseExistingServer: !CI,
        },
        {
            command: "node e2e/support/mock-nicepay.mjs",
            url: `${E2E_PAYMENT.apiBase}/health`,
            reuseExistingServer: !CI,
        },
        {
            // CI 는 프로덕션 빌드로, 로컬은 개발 서버로 띄운다.
            command: CI
                ? `npm run build && npx next start -p ${PORT}`
                : `npx next dev -p ${PORT}`,
            url: BASE_URL,
            timeout: 300_000,
            reuseExistingServer: !CI,
            env: {
                JUSO_CONFM_KEY: "e2e-local-address-only",
                JUSO_API_BASE_URL: "http://127.0.0.1:4011",
                NEXT_PUBLIC_NICEPAY_CLIENT_KEY: E2E_PAYMENT.clientKey,
                NICEPAY_SECRET_KEY: E2E_PAYMENT.secretKey,
                NICEPAY_API_BASE_URL: E2E_PAYMENT.apiBase,
                NEXT_PUBLIC_SITE_URL: BASE_URL,
                NEXT_PUBLIC_DIRECT_ASSIGNMENT_FLOW: DIRECT_FLOW
                    ? "true"
                    : "false",
                // 외부 메일은 호출하지 않는다 — .env.local 에 실제 키가 있어도 비운다(빈 값은 미설정).
                RESEND_API_KEY: "",
            },
        },
    ],
});

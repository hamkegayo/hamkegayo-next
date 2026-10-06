import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// 단위 테스트(계층 1). DB·네트워크 없이 순수 함수만 검증한다 — docs/testing.md
export default defineConfig({
    resolve: {
        alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
    },
    test: {
        include: ["**/*.test.ts"],
        // Playwright 스펙만 뺀다. e2e/support 의 순수 함수 테스트는 여기서 돈다.
        exclude: ["node_modules/**", ".next/**", "e2e/**/*.spec.ts"],
        environment: "node",
        // Vercel 서버는 UTC다. 개발 PC(KST)에서만 통과하는 시간대 버그를 막는다.
        env: { TZ: "UTC" },
    },
});

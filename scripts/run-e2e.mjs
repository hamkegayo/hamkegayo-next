// E2E 실행기 (#300). 피처 플래그 값마다 서버가 따로 필요해 Playwright 를 두 번 돌린다.
//   1) 플래그 꺼짐 — 기존 예약 흐름 회귀 (포트 3100)
//   2) 플래그 켜짐 — 선결제 → 매칭 대기 → 관리자 배정/재배정/실패·환불 (포트 3101)
// 인자는 두 실행에 모두 전달된다. E2E_ONLY=legacy|direct 로 한쪽만 돌릴 수 있다.
import { spawnSync } from "node:child_process";

const only = process.env.E2E_ONLY;
const runs = [
    ["legacy", "0"],
    ["direct", "1"],
].filter(([name]) => !only || only === name);

let failed = false;
for (const [name, flag] of runs) {
    console.log(
        `\n=== E2E (${name}, NEXT_PUBLIC_DIRECT_ASSIGNMENT_FLOW=${flag === "1"}) ===`,
    );
    const r = spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["playwright", "test", ...process.argv.slice(2)],
        {
            stdio: "inherit",
            shell: process.platform === "win32",
            env: { ...process.env, E2E_DIRECT_FLOW: flag },
        },
    );
    if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);

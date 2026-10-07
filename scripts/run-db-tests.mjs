// DB 통합 테스트 진입점 (#214) — `npm run test:db`
//
// 왜 필요한가
//   DB 테스트 목록이 be-check.yml 단계에만 적혀 있어 로컬에서 같은 순서로
//   돌리려면 워크플로를 보고 손으로 따라 쳐야 했다. 목록을 여기 한 곳에 두고
//   CI 와 로컬이 같은 진입점을 쓴다. 새 DB 테스트는 아래 SUITES 에 추가한다.
//
// 사용
//   npx supabase start && npm run seed:dev   # 선행 조건
//   npm run test:db                          # 전체
//   npm run test:db -- --list                # 목록만
//   npm run test:db -- --only evidence       # 이름·파일에 evidence 가 들어간 묶음만
//
// 안전장치
//   로컬 스택(127.0.0.1/localhost)에서만 실행한다. SQL 테스트는 begin/rollback
//   으로 감싸져 있지만 Node 테스트는 실제로 행을 만들고 지운다.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const STRIP = ["--experimental-strip-types", "--no-warnings"];

const npm = (script) => ({ kind: "npm", script });
const sql = (file) => ({ kind: "sql", file: `scripts/${file}` });
// 순수 Node 스크립트(타입 스트리핑). DB 를 쓰지 않지만 같은 도메인 묶음이라 함께 돈다.
const node = (file) => ({ kind: "node", args: [...STRIP, `scripts/${file}`] });
// .env.local 의 로컬 스택 키로 Supabase 에 접속하는 Node 스크립트.
const nodeEnv = (file) => ({
    kind: "node",
    args: ["--env-file=.env.local", `scripts/${file}`],
});

/** 전부 "무엇이 되는가" 가 아니라 **"무엇이 안 되는가"** 를 본다. 순서는 CI 와 같다. */
export const SUITES = [
    [
        "결제·정산 스키마와 심사용 무기한 토큰 (#49 · #81)",
        [npm("test:payments")],
    ],
    [
        "환불 선점 · MFA · 원장 일회 기록 (#80)",
        [sql("test-admin-refund-execution.sql")],
    ],
    ["동의 이력 불변성 (#58)", [npm("test:agreements")]],
    ["서비스 수행 시각 무결성 (#55)", [npm("test:service")]],
    [
        "예외 종료 청구·환불·완료 보류 (#185)",
        [sql("test-service-exception.sql")],
    ],
    [
        "서비스 시간 · KST 자동 마감 경계 (#176)",
        [sql("test-service-hours.sql")],
    ],
    [
        "자격·경력 증빙 · 비공개 열람 · 파기 큐 (#199)",
        [
            sql("test-partner-evidence.sql"),
            sql("test-evidence-retention.sql"),
            node("test-evidence-link-ttl.mjs"),
        ],
    ],
    ["파트너 개인정보 3단계 경계 (#66 · #67)", [npm("test:partner")]],
    [
        "오픈 이벤트 정원·결제·권한 경계 (#159)",
        [
            sql("test-opening-event.sql"),
            nodeEnv("test-opening-event-concurrency.mjs"),
            node("test-opening-event-email.mjs"),
        ],
    ],
    [
        "제공 후기 공개 범위·중복 등록 (#175)",
        [
            sql("test-imported-reviews.sql"),
            sql("test-confirmed-review-publication.sql"),
        ],
    ],
    [
        "실제 이용자 후기 공개 동의·3년 만료·철회",
        [
            sql("test-review-publication-consent.sql"),
            sql("test-cancelled-transfer-retention.sql"),
            sql("test-public-applicant-ratings.sql"),
        ],
    ],
    [
        "관리자 사고 거래 취소 권한·MFA·중복 차단 (#80)",
        [sql("test-admin-incident-cancel.sql")],
    ],
    [
        "예외 종료 운영 판정·PG 확인·정산 보류 해제 (#185)",
        [
            node("test-exception-verification.mjs"),
            sql("test-exception-resolution.sql"),
        ],
    ],
    ["관리자 권한·접근통제·접속기록 (#50)", [npm("test:admin")]],
    [
        "예약 파트너 상세 · 공개 동의 · 경력 심사 (#173)",
        [sql("test-partner-details.sql")],
    ],
    [
        "파트너 활동 정보 · 값 검증 · 공개 동의 v2 (#226)",
        [sql("test-partner-activity.sql")],
    ],
    [
        "예약 주소 법정동코드 · 형식 · 3년 파기 (#226)",
        [sql("test-reservation-region-codes.sql")],
    ],
    [
        "수락 대기 요청 매칭 · 지역/이동수단 판정 · 주소 비노출 (#226)",
        [sql("test-partner-request-matches.sql")],
    ],
    [
        "파트너 생년월일 본인확인 · 즉시 파기 · 30일 자동 파기 (#226)",
        [sql("test-partner-identity.sql")],
    ],
    [
        "결제 포인트 1% 적립 · 정산 완료 후 1회 · 소급 없음 (#249)",
        [sql("test-point-earn.sql")],
    ],
    [
        "귀책 보상 포인트 지급 · 상한 100,000P · 회수 · 감사 기록 (#250)",
        [sql("test-point-compensation.sql")],
    ],
    [
        "고객 보호자 리포트 열람 · 동의 범위 · 파기 · 접근 기록 (#253)",
        [sql("test-customer-report.sql")],
    ],
    [
        "파트너 교육 이수 기록 · 미이수 수락 차단 스위치 (#255)",
        [sql("test-partner-training.sql")],
    ],
    ["정산 계좌 열람 통제 (#51)", [npm("test:payout")]],
    [
        "이메일 인증 연락처 변경 · 목적/대상/일회 소비 (#64)",
        [sql("test-partner-phone-email.sql")],
    ],
    ["탈퇴 시 보존·파기 (#72)", [npm("test:withdrawal")]],
    ["보유기간 만료 파기·legal hold·첨부 삭제 (#99)", [npm("test:retention")]],
    // 재설정은 계정을 빼앗겼을 때 되찾는 경로다. 핵심은 **기존 세션이 죽는가** 이고,
    // 그건 GoTrue 의 동작이라 우리 코드 변경 없이도 사라질 수 있다.
    ["비밀번호 재설정·세션 실효 (#127)", [npm("test:reset")]],
    // 개정 고지는 약관 제4조 ③ · 처리방침 제16조 ② 가 요구하는 절차다.
    ["약관 재동의 안내·중복 방지 (#91)", [npm("test:reconsent")]],
    // ⚠️ test:nicepay · test:payapi 는 넣지 않는다. NICEPAY 샌드박스 실호출이라
    //    외부 장애가 CI 실패로 둔갑한다 (테스트 가이드 3. 외부 연동 — https://app.notion.com/p/3f1169f76f9f819ca52ef036622c3fc1).
];

const isWin = process.platform === "win32";
const inCi = process.env.GITHUB_ACTIONS === "true";

function run(cmd, args, extra = {}) {
    return spawnSync(cmd, args, { stdio: "inherit", shell: isWin, ...extra });
}

function hasCommand(cmd) {
    const probe = spawnSync(isWin ? "where" : "which", [cmd], {
        stdio: "ignore",
    });
    return probe.status === 0;
}

/** 로컬 스택 DB URL. DB_URL 이 있으면 그대로, 없으면 supabase status 에서 읽는다. */
function resolveDbUrl() {
    if (process.env.DB_URL) return process.env.DB_URL;
    const [cmd, pre] = hasCommand("supabase")
        ? ["supabase", []]
        : ["npx", ["supabase"]];
    const out = spawnSync(cmd, [...pre, "status", "-o", "env"], {
        encoding: "utf8",
        shell: isWin,
    });
    const line = (out.stdout ?? "")
        .split(/\r?\n/)
        .find((l) => l.startsWith("DB_URL="));
    if (!line) {
        console.error(
            "로컬 Supabase 가 실행 중이 아닙니다. 먼저 `npx supabase start` 를 실행하세요.",
        );
        process.exit(1);
    }
    return line.slice("DB_URL=".length).replace(/^"|"$/g, "");
}

function assertLocal(dbUrl) {
    const host = /@([^:/?]+)/.exec(dbUrl)?.[1];
    if (host !== "127.0.0.1" && host !== "localhost") {
        console.error(
            `DB 통합 테스트는 로컬 스택에서만 실행합니다 (대상: ${host ?? "알 수 없음"}).`,
        );
        process.exit(1);
    }
}

/** psql 이 없으면(Windows 로컬 등) 로컬 DB 컨테이너 안의 psql 을 쓴다. */
function sqlRunner(dbUrl) {
    if (hasCommand("psql")) {
        return (file) =>
            run("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", file]);
    }
    const container = "supabase_db_my-app"; // supabase/config.toml 의 project_id
    return (file) =>
        spawnSync(
            "docker",
            [
                "exec",
                "-i",
                container,
                "psql",
                "-U",
                "postgres",
                "-v",
                "ON_ERROR_STOP=1",
                "-q",
            ],
            {
                stdio: ["pipe", "inherit", "inherit"],
                input: readFileSync(file),
            },
        );
}

const USAGE = `사용법: npm run test:db [-- --list] [-- --only <키워드>]
  --list            묶음 목록만 출력
  --only <키워드>    이름·파일에 키워드가 들어간 묶음만 실행`;

/**
 * 인자를 엄격하게 해석한다. `--only` 값 누락이나 옵션 오타가 조용히 전체 실행으로
 * 이어지지 않도록, 해석할 수 없으면 사용법을 출력하고 종료한다.
 */
export function parseArgs(argv) {
    let only = null;
    let list = false;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--list") {
            list = true;
        } else if (arg === "--only") {
            const value = argv[i + 1];
            if (!value || value.startsWith("--") || !value.trim()) {
                return { error: "--only 뒤에 키워드를 입력하세요." };
            }
            only = value;
            i += 1;
        } else {
            return { error: `알 수 없는 인자: ${arg}` };
        }
    }
    return { only, list };
}

function main() {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.error) {
        console.error(`${parsed.error}\n\n${USAGE}`);
        process.exit(2);
    }
    const { only, list } = parsed;
    const selected = SUITES.filter(
        ([name, steps]) =>
            !only ||
            name.includes(only) ||
            steps.some((s) =>
                (s.file ?? s.script ?? s.args?.join(" ") ?? "").includes(only),
            ),
    );

    if (list) {
        selected.forEach(([name], i) =>
            console.log(`${String(i + 1).padStart(2)}. ${name}`),
        );
        return;
    }
    if (selected.length === 0) {
        console.error(
            `--only ${only} 에 해당하는 테스트가 없습니다. --list 로 목록을 확인하세요.`,
        );
        process.exit(1);
    }

    const dbUrl = resolveDbUrl();
    assertLocal(dbUrl);
    const runSql = sqlRunner(dbUrl);

    const failures = [];
    for (const [name, steps] of selected) {
        console.log(inCi ? `::group::${name}` : `\n▶ ${name}`);
        let ok = true;
        for (const step of steps) {
            const res =
                step.kind === "npm"
                    ? run("npm", ["run", "-s", step.script])
                    : step.kind === "sql"
                      ? runSql(step.file)
                      : run(process.execPath, step.args, { shell: false });
            if (res.status !== 0) {
                ok = false;
                break;
            }
        }
        if (inCi) console.log("::endgroup::");
        if (!ok) {
            failures.push(name);
            console.log(inCi ? `::error::실패: ${name}` : `✗ 실패: ${name}`);
        }
    }

    console.log(
        `\nDB 통합 테스트 ${selected.length - failures.length}/${selected.length} 묶음 통과`,
    );
    if (failures.length > 0) {
        failures.forEach((f) => console.log(`  ✗ ${f}`));
        process.exit(1);
    }
}

// 테스트에서 parseArgs 만 불러올 때는 실행하지 않는다.
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main();
}

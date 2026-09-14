import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const IDENTIFIER = String.raw`(?:"(?:[^"]|"")*"|[a-zA-Z_][\w$]*)`;
const QUALIFIED_NAME = String.raw`${IDENTIFIER}(?:\.${IDENTIFIER}){0,2}`;

const RISK_LABELS = {
    ADD_NOT_NULL: "기본값 없는 NOT NULL 컬럼 추가",
    SET_NOT_NULL: "기존 컬럼에 NOT NULL 설정",
    UNIQUE_INDEX: "유니크 인덱스 생성",
    ALTER_TYPE: "컬럼 타입 변경",
};

function stripComments(sql) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, (comment) =>
            comment.replace(/[^\n]/g, " "),
        )
        .replace(/--[^\n]*/g, (comment) => " ".repeat(comment.length));
}

function lineAt(sql, index) {
    return sql.slice(0, index).split("\n").length;
}

export function analyzeMigrationSql(sql) {
    const cleanSql = stripComments(sql);
    const findings = [];
    const statements = cleanSql.matchAll(/[^;]+(?:;|$)/g);

    for (const statementMatch of statements) {
        const statement = statementMatch[0];
        const statementIndex = statementMatch.index ?? 0;
        const firstTokenOffset = statement.search(/\S/);
        const line = lineAt(
            cleanSql,
            statementIndex + Math.max(firstTokenOffset, 0),
        );

        const uniqueIndex = statement.match(
            new RegExp(
                String.raw`\bcreate\s+unique\s+index(?:\s+concurrently)?(?:\s+if\s+not\s+exists)?(?:\s+${IDENTIFIER})?\s+on\s+(?:only\s+)?(${QUALIFIED_NAME})\b`,
                "i",
            ),
        );
        if (uniqueIndex) {
            findings.push({
                type: "UNIQUE_INDEX",
                table: uniqueIndex[1],
                line,
            });
        }

        const alterTable = statement.match(
            new RegExp(
                String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QUALIFIED_NAME})\s+([\s\S]*)`,
                "i",
            ),
        );
        if (!alterTable) continue;

        const [, table, body] = alterTable;
        const actions = body.split(/,(?=\s*(?:add|alter|drop|rename)\b)/gi);

        for (const action of actions) {
            const addColumn = action.match(
                new RegExp(
                    String.raw`^\s*add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?${IDENTIFIER}\s+([\s\S]*)`,
                    "i",
                ),
            );
            if (
                addColumn &&
                /\bnot\s+null\b/i.test(addColumn[1]) &&
                !/\bdefault\b/i.test(addColumn[1])
            ) {
                findings.push({ type: "ADD_NOT_NULL", table, line });
            }

            if (
                new RegExp(
                    String.raw`^\s*alter\s+(?:column\s+)?${IDENTIFIER}\s+set\s+not\s+null\b`,
                    "i",
                ).test(action)
            ) {
                findings.push({ type: "SET_NOT_NULL", table, line });
            }

            if (
                new RegExp(
                    String.raw`^\s*alter\s+(?:column\s+)?${IDENTIFIER}\s+(?:set\s+data\s+)?type\b`,
                    "i",
                ).test(action)
            ) {
                findings.push({ type: "ALTER_TYPE", table, line });
            }
        }
    }

    return findings;
}

function git(...args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function changedMigrationFiles() {
    const baseRef =
        process.env.MIGRATION_DIFF_BASE ??
        (process.env.GITHUB_BASE_REF
            ? `origin/${process.env.GITHUB_BASE_REF}`
            : "origin/dev");
    const mergeBase = git("merge-base", baseRef, "HEAD");
    const output = git(
        "diff",
        "--diff-filter=A",
        "--name-only",
        mergeBase,
        "HEAD",
        "--",
        "supabase/migrations/*.sql",
    );

    return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function main() {
    const files = changedMigrationFiles();
    if (files.length === 0) {
        console.log("✅ 새로 추가된 마이그레이션이 없습니다.");
        return;
    }

    const warnings = files.flatMap((file) =>
        analyzeMigrationSql(readFileSync(file, "utf8")).map((finding) => ({
            ...finding,
            file,
        })),
    );

    if (warnings.length === 0) {
        console.log(
            `✅ 신규 마이그레이션 ${files.length}개에서 위험 DDL 후보가 발견되지 않았습니다.`,
        );
        return;
    }

    console.warn(
        `⚠️ 신규 마이그레이션에서 위험 DDL 후보 ${warnings.length}건을 발견했습니다.`,
    );
    console.warn(
        "   빈 테이블이면 안전할 수 있으므로 차단하지 않습니다. 대상 테이블의 기존 행을 확인하세요.\n",
    );

    for (const warning of warnings) {
        console.warn(
            `${warning.file}:${warning.line} [${warning.type}] ${RISK_LABELS[warning.type]}`,
        );
        console.warn(`  확인 SQL: select count(*) from ${warning.table};`);
    }
}

if (process.argv[1]?.endsWith("check-migrations.mjs")) {
    main();
}

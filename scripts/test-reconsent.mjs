// 약관·방침 재동의 재현 테스트 (#91).
//
// 실행 (Node 22.6+):
//   1) `npx supabase start` 로 로컬 스택이 떠 있을 것
//   2) npm run test:reconsent
//
// ── 격리 ──────────────────────────────────────────────────────
//
//  이 스크립트는 **쓰기를 한다.** 계정을 만들고, 동의 이력과 알림을 넣는다.
//  운영 DB 에 닿으면 실제 회원의 동의 이력 옆에 테스트 행이 생긴다.
//  그래서 세 겹으로 막는다.
//
//   1. assertSeedTarget — 로컬은 통과, 원격은 SEED_TARGET_REF 에 대상 ref 를
//      직접 적어야 열리고, 운영 ref 는 적어도 차단된다(_target-guard.mjs)
//   2. 일회용 계정 — 공용 시드 계정을 건드리지 않는다. 매번 만들고 지운다
//   3. cleanup — 성공·실패·예외 어느 경로로 끝나도 탄다
//
//  ⚠️ 읽기는 전체를 훑는다(collectReconsentTargets). 스테이징에서 돌리면
//     다른 시드 계정도 스캔 대상이 되지만 **판정은 이 스크립트가 만든
//     계정에 대해서만** 한다. 다른 행을 고치지 않는다.
//
// ── 무엇을 지키려는 테스트인가 ────────────────────────────────
//
//  개정 고지는 약관 제4조 ③ 과 처리방침 제16조 ② 가 요구하는 절차다.
//  깨져도 화면은 멀쩡하고, 개정이 실제로 일어나야 드러난다. 그때는 이미
//  늦다 — 고지 없이 개정이 지나간 뒤다.
//
//  특히 **중복 방지**가 핵심이다. 재동의 대상은 사건이 아니라 상태라
//  배치가 돌 때마다 참이다. 막지 않으면 같은 안내가 날마다 쌓인다.

import { createClient } from "@supabase/supabase-js";

import { assertSeedTarget } from "./_target-guard.mjs";
import {
    collectReconsentTargets,
    documentTitleOf,
    reconsentDedupeKey,
} from "@/lib/legal/reconsent";
import { AGREEMENT_VERSION } from "@/lib/legal/agreements";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error("❌ SUPABASE URL / SERVICE_ROLE 키가 필요합니다.");
    process.exit(1);
}

assertSeedTarget(url, "test-reconsent.mjs");

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
});

/** 이 스크립트가 만든 것만 지운다 */
const EMAIL = "reconsent-test-91@example.com";
/** 초판 — 모든 문서가 이 버전에서 출발했다 */
const FIRST_EDITION = "2026-09-03";

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

async function findAuthUser(email) {
    const { data } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
    });
    return data.users.find((u) => u.email === email) ?? null;
}

async function cleanup() {
    const u = await findAuthUser(EMAIL);
    if (!u) return;
    await admin.from("notifications").delete().eq("recipient_id", u.id);
    await admin.from("user_agreements").delete().eq("user_id", u.id);
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
}

async function main() {
    await cleanup();

    const { data: made, error: mkErr } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: "reconsent-test-1!",
        email_confirm: true,
    });
    if (mkErr || !made?.user) {
        throw new Error(`계정 생성 실패: ${mkErr?.message}`);
    }
    const uid = made.user.id;
    await admin.from("profiles").insert({
        id: uid,
        role: "USER",
        name: "재동의테스트",
        email: EMAIL,
        phone: "01000000091",
        status: "ACTIVE",
    });

    // 초판에 동의한 상태를 만든다
    await admin.from("user_agreements").insert(
        ["SERVICE", "PRIVACY", "PERSONAL", "SENSITIVE"].map((t) => ({
            user_id: uid,
            agreement_type: t,
            version: FIRST_EDITION,
        })),
    );

    console.log("\n[1] 재동의 대상 판별");
    const items = (await collectReconsentTargets(admin)).get(uid) ?? [];
    const types = items.map((i) => i.type).sort();

    // 현행 버전이 초판과 다른 항목만 대상이다. 어느 문서가 개정됐는지는
    // AGREEMENT_VERSION 이 답한다 — 여기에 문서명을 박으면 다음 개정 때 어긋난다.
    const expected = Object.entries(AGREEMENT_VERSION)
        .filter(([, v]) => v !== FIRST_EDITION)
        .map(([t]) => t)
        .sort();

    check(
        `개정된 문서의 항목만 대상 (${expected.join(", ") || "없음"})`,
        JSON.stringify(types) === JSON.stringify(expected),
        `실제 ${JSON.stringify(types)}`,
    );
    if (items.length > 0) {
        check("문서명을 맞게 고른다", !!documentTitleOf(items[0].type));
        check(
            "중복 방지 키에 버전이 들어간다",
            reconsentDedupeKey(items[0]).endsWith(`:${items[0].current}`),
        );
    }

    console.log("\n[2] 알림 중복 방지 — 상태형은 한 번만");
    if (items.length > 0) {
        const key = reconsentDedupeKey(items[0]);
        const row = {
            recipient_id: uid,
            type: "AGREEMENT_REVISED",
            title: "개정 안내",
            link: "/mypage/profile",
            dedupe_key: key,
        };
        for (let i = 0; i < 3; i++) {
            const { error } = await admin.from("notifications").upsert(row, {
                onConflict: "recipient_id,dedupe_key",
                ignoreDuplicates: true,
            });
            if (error) console.log(`        upsert 오류: ${error.message}`);
        }
        const { data: dedup } = await admin
            .from("notifications")
            .select("id")
            .eq("recipient_id", uid)
            .not("dedupe_key", "is", null);
        check(
            "3번 넣어도 1건만 남는다",
            dedup?.length === 1,
            `실제 ${dedup?.length}건`,
        );
    }

    console.log("\n[3] 사건형 알림은 그대로 쌓인다");
    for (let i = 0; i < 2; i++) {
        await admin.from("notifications").insert({
            recipient_id: uid,
            type: "REPORT_READY",
            title: "리포트 도착",
        });
    }
    const { data: eventish } = await admin
        .from("notifications")
        .select("id")
        .eq("recipient_id", uid)
        .is("dedupe_key", null);
    check(
        "키 없는 알림 2건이 모두 남는다",
        eventish?.length === 2,
        `실제 ${eventish?.length}건`,
    );

    console.log("\n[4] 재동의 적재");
    const before = (
        await admin.from("user_agreements").select("id").eq("user_id", uid)
    ).data.length;

    await admin.from("user_agreements").upsert(
        Object.entries(AGREEMENT_VERSION).map(([t, v]) => ({
            user_id: uid,
            agreement_type: t,
            version: v,
        })),
        {
            onConflict: "user_id,agreement_type,version",
            ignoreDuplicates: true,
        },
    );

    check(
        "재동의 후 대상에서 빠진다",
        !(await collectReconsentTargets(admin)).get(uid)?.length,
    );

    const after = (
        await admin.from("user_agreements").select("id").eq("user_id", uid)
    ).data.length;
    check(
        `기존 이력이 보존된다 (${before} → ${after}행)`,
        after === before + expected.length,
        `기대 ${before + expected.length}행`,
    );

    console.log("\n[5] 멱등");
    await admin.from("user_agreements").upsert(
        Object.entries(AGREEMENT_VERSION).map(([t, v]) => ({
            user_id: uid,
            agreement_type: t,
            version: v,
        })),
        {
            onConflict: "user_id,agreement_type,version",
            ignoreDuplicates: true,
        },
    );
    const twice = (
        await admin.from("user_agreements").select("id").eq("user_id", uid)
    ).data.length;
    check("다시 눌러도 행이 늘지 않는다", twice === after, `실제 ${twice}행`);

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

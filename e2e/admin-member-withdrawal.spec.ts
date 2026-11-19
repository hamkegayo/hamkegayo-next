import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./support/accounts";
import { localSupabaseAdmin } from "./support/local-supabase";
import { totp } from "./support/totp";

/**
 * 로그인할 수 없는 회원의 운영자 탈퇴 처리 (#293).
 *  - /admin/withdrawals : 정확 일치 검색 → 처리 근거·의사 확인 → 2단계 확인 → 탈퇴
 *  - /admin/social-unlinks : 안내 문구 · 연결 해제 건에서 운영자 탈퇴 → 기록 동시 파기
 * 매 테스트가 일회용 회원을 만들고 끝나면 지운다(접속기록은 감사 기록이라 남긴다).
 */

const db = () => localSupabaseAdmin();
const PREFIX = "e2e-293-wd";

type Disposable = { id: string; email: string; phone: string };

async function createDisposableMember(tag: string): Promise<Disposable> {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = `${PREFIX}-${tag}-${stamp}@example.com`;
    const phone = `0109${stamp.slice(-7)}`;
    const created = await db().auth.admin.createUser({
        email,
        password: "e2e-293-wd-1234!",
        email_confirm: true,
    });
    if (created.error || !created.data.user)
        throw created.error ?? new Error("일회용 회원 생성 실패");
    const id = created.data.user.id;
    const { error } = await db()
        .from("profiles")
        .upsert({
            id,
            role: "USER",
            name: `E2E탈퇴${tag}`,
            email,
            phone,
            status: "ACTIVE",
        });
    if (error) throw error;
    return { id, email, phone };
}

/** 일회용 회원과 분리 보관본·연결 해제 건을 지운다. 탈퇴 후 이메일이 바뀌므로 id 로 지운다. */
async function cleanupMember(member: Disposable | null) {
    if (!member) return;
    await db().from("social_unlink_events").delete().eq("user_id", member.id);
    await db().from("withdrawn_members").delete().eq("profile_id", member.id);
    await db().auth.admin.deleteUser(member.id);
}

async function expectWithdrawn(member: Disposable) {
    const { data: profile } = await db()
        .from("profiles")
        .select("status, name, email, phone, withdrawn_at")
        .eq("id", member.id)
        .single();
    expect(profile).toMatchObject({
        status: "WITHDRAWN",
        name: "탈퇴회원",
        email: null,
        phone: null,
    });
    expect(profile?.withdrawn_at).toBeTruthy();

    const { data: kept } = await db()
        .from("withdrawn_members")
        .select("email, phone, reason")
        .eq("profile_id", member.id)
        .single();
    expect(kept?.email).toBe(member.email);
    expect(kept?.phone).toBe(member.phone);

    // DB 탈퇴가 커밋된 뒤에만 로그인 수단을 잠근다.
    const { data: auth } = await db().auth.admin.getUserById(member.id);
    expect(auth.user?.email).toBe(
        `withdrawn+${member.id}@users.hamkegayo.invalid`,
    );
    const bannedUntil = (auth.user as { banned_until?: string } | null)
        ?.banned_until;
    expect(bannedUntil && new Date(bannedUntil).getTime()).toBeGreaterThan(
        Date.now() + 365 * 86_400_000,
    );

    const { data: logs } = await db()
        .from("access_logs")
        .select("action, reason")
        .eq("subject_id", member.id);
    expect(logs?.some((l) => l.action === "ADMIN_MEMBER_WITHDRAW")).toBe(true);
    return logs ?? [];
}

async function submitWithdrawal(
    scope: ReturnType<Page["locator"]>,
    reason: string,
) {
    await scope.getByLabel(/처리 근거/).fill(reason);
    await scope
        .getByLabel(/고객문의 채널을 통해 회원 본인의 탈퇴 의사를 확인했습니다/)
        .check();
    await scope.getByRole("button", { name: "운영자 탈퇴 처리" }).click();
    await scope.getByRole("button", { name: "탈퇴 최종 확인" }).click();
}

test("고객문의 탈퇴 요청: 정확 일치 검색 후 운영자 탈퇴 처리", async ({
    page,
}) => {
    let member: Disposable | null = null;
    try {
        member = await createDisposableMember("search");
        await loginAsAdmin(page, totp);

        await page.goto("/admin/withdrawals");
        await expect(
            page.getByRole("heading", { name: "운영자 회원 탈퇴" }),
        ).toBeVisible();
        await expect(
            page.getByText("탈퇴 처리하지 않고 계정을 유지"),
        ).toBeVisible();

        // 부분 검색은 버튼이 열리지 않는다
        const query = page.locator("#withdrawal-query");
        await query.fill(PREFIX);
        await expect(
            page.getByRole("button", { name: "검색", exact: true }),
        ).toBeDisabled();

        // 대소문자를 바꾼 이메일로 정확 일치 검색
        await query.fill(member.email.toUpperCase());
        await page.getByRole("button", { name: "검색", exact: true }).click();
        const card = page.getByTestId("withdrawal-member");
        await expect(card).toHaveCount(1);
        await expect(card).toContainText(member.email);
        await expect(card).toContainText("회원(USER)");

        await submitWithdrawal(
            card,
            "E2E 이메일 고객문의로 본인 탈퇴 의사 확인",
        );
        await expect(page.getByText("탈퇴 처리했습니다.")).toBeVisible();
        // 탈퇴 후에는 UUID 로 다시 찾아 상태를 보여 준다
        await expect(card).toContainText("이미 탈퇴 처리된 회원입니다.");

        const logs = await expectWithdrawn(member);
        const lookups = logs.filter(
            (l) => l.action === "MEMBER_WITHDRAWAL_LOOKUP",
        );
        expect(lookups.length).toBeGreaterThan(0);
        // 검색어 원문은 접속기록에 남지 않는다
        for (const l of lookups) {
            expect(l.reason ?? "").not.toContain("@");
            expect(l.reason ?? "").not.toContain(member.phone);
        }
    } finally {
        await cleanupMember(member);
    }
});

test("카카오 연결 해제: 안내 문구와 연결 해제 건에서 운영자 탈퇴", async ({
    page,
}) => {
    let member: Disposable | null = null;
    let eventId: string | null = null;
    try {
        member = await createDisposableMember("unlink");
        const providerUserId = String(Date.now()).slice(-12);
        const { data: event, error } = await db()
            .from("social_unlink_events")
            .insert({
                provider: "kakao",
                provider_user_id: providerUserId,
                referrer_type: "ACCOUNT_DELETE",
                user_id: member.id,
            })
            .select("id")
            .single();
        if (error) throw error;
        eventId = event.id as string;

        await loginAsAdmin(page, totp);
        await page.goto("/admin/social-unlinks");
        await expect(
            page.getByText("개발 담당에게 처리를 요청합니다"),
        ).toHaveCount(0);
        await expect(
            page.getByText("탈퇴 처리하지 않고 계정을 유지"),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "일반 고객문의 탈퇴 처리" }),
        ).toHaveAttribute("href", "/admin/withdrawals");

        const card = page.locator("li", { hasText: member.email });
        await expect(card).toHaveCount(1);
        await card.getByText("로그인 불가 회원 운영자 탈퇴 처리").click();
        await submitWithdrawal(
            card,
            "E2E 카카오톡 고객문의로 본인 탈퇴 의사 확인",
        );
        await expect(
            page.getByText(
                "탈퇴 처리했습니다. 연결 해제 기록도 함께 파기됐습니다.",
            ),
        ).toBeVisible();
        await expect(page.locator("li", { hasText: member.email })).toHaveCount(
            0,
        );

        const logs = await expectWithdrawn(member);
        expect(logs.some((l) => l.action === "SOCIAL_UNLINK_RESOLVE")).toBe(
            true,
        );
        const { data: left } = await db()
            .from("social_unlink_events")
            .select("id")
            .eq("id", eventId);
        expect(left ?? []).toHaveLength(0);
    } finally {
        if (eventId)
            await db().from("social_unlink_events").delete().eq("id", eventId);
        await cleanupMember(member);
    }
});

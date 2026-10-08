import { expect, test } from "@playwright/test";
import { loginAsPartner } from "./support/accounts";
import { localSupabaseAdmin } from "./support/local-supabase";

test("파트너 프로필 통합 저장, 실패 입력 유지, 증빙 선택 제거와 모바일 가독성", async ({
    page,
}) => {
    const db = localSupabaseAdmin();
    const { data: account, error: accountError } = await db
        .from("partner_accounts")
        .select("profile_id,intro")
        .eq("login_id", "tpart01")
        .single();
    if (accountError) throw accountError;
    const releases = ["partner_evidence_release", "partner_identity_release"];
    const previous = new Map<string, boolean>();
    const qualificationIds = [crypto.randomUUID(), crypto.randomUUID()];
    const historyIds = [crypto.randomUUID(), crypto.randomUUID()];
    for (const table of releases) {
        const { data, error } = await db
            .from(table)
            .select("enabled")
            .eq("id", true)
            .single();
        if (error) throw error;
        previous.set(table, data.enabled);
    }
    try {
        const { error: qualificationError } = await db
            .from("partner_qualifications")
            .insert([
                {
                    id: qualificationIds[0],
                    partner_id: account.profile_id,
                    type: "E2E 자격 대기",
                    issuer: "예시 발급기관",
                    acquired_date: "2025-03-01",
                    status: "PENDING",
                },
                {
                    id: qualificationIds[1],
                    partner_id: account.profile_id,
                    type: "E2E 자격 인증",
                    issuer: "예시 인증기관",
                    acquired_date: "2024-01-01",
                    status: "VERIFIED",
                },
            ]);
        if (qualificationError) throw qualificationError;
        const { error: historyError } = await db
            .from("partner_work_histories")
            .insert([
                {
                    id: historyIds[0],
                    partner_id: account.profile_id,
                    hospital: "E2E 예시 의료기관",
                    period: "2022.01-2024.12",
                    department: "외래",
                    duties: "예시 담당 업무",
                    kind: "MEDICAL",
                    status: "VERIFIED",
                },
                {
                    id: historyIds[1],
                    partner_id: account.profile_id,
                    hospital: "E2E 예시 동행기관",
                    period: "2025.01-2026.01",
                    department: "동행",
                    duties: "예시 동행 업무",
                    kind: "COMPANION",
                    status: "PENDING",
                },
            ]);
        if (historyError) throw historyError;
        for (const table of releases) {
            const { error } = await db
                .from(table)
                .update({ enabled: true })
                .eq("id", true);
            if (error) throw error;
        }
        await loginAsPartner(page);
        await page.goto("/partner/profile");
        const intro = page.getByLabel("자기소개", { exact: true });
        await intro.fill("E2E 프로필 저장 확인");
        await expect(
            page.getByRole("button", { name: "자기소개 저장", exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "활동 정보 저장", exact: true }),
        ).toHaveCount(0);
        await page
            .getByRole("button", { name: "프로필 저장", exact: true })
            .click();
        // 저장 완료 안내를 확인하면 저장된 값으로 새로고침한다.
        const doneDialog = page.getByRole("dialog");
        await expect(doneDialog).toContainText("프로필을 저장했습니다.");
        await Promise.all([
            page.waitForEvent("load"),
            doneDialog
                .getByRole("button", { name: "확인", exact: true })
                .click(),
        ]);
        await expect(intro).toHaveValue("E2E 프로필 저장 확인");

        await intro.fill("E2E 되돌릴 입력");
        await page
            .getByRole("button", { name: "변경사항 되돌리기", exact: true })
            .click();
        await expect(doneDialog).toContainText("변경사항을 되돌렸습니다.");
        await Promise.all([
            page.waitForEvent("load"),
            doneDialog
                .getByRole("button", { name: "확인", exact: true })
                .click(),
        ]);
        await expect(intro).toHaveValue("E2E 프로필 저장 확인");

        await intro.fill("E2E 실패해도 남는 입력");
        await page.route("**/partner/profile", async (route) => {
            if (
                route.request().method() === "POST" &&
                route.request().postData()?.includes("E2E 실패해도 남는 입력")
            )
                await route.abort();
            else await route.continue();
        });
        await page
            .getByRole("button", { name: "프로필 저장", exact: true })
            .click();
        await expect(
            page
                .getByRole("status")
                .filter({ hasText: "입력 내용은 유지됩니다" }),
        ).toBeVisible();
        await expect(intro).toHaveValue("E2E 실패해도 남는 입력");
        await page.unroute("**/partner/profile");

        const birth = page.locator("#partnerBirthDate");
        if (await birth.count()) {
            await birth.fill("19850315");
            await expect(birth).toHaveValue("1985-03-15");
            await expect(birth).toHaveAttribute("type", "text");
            await expect(
                page.getByRole("button", { name: "달력에서 날짜 선택" }),
            ).toBeVisible();
        }
        const file = page.locator('input[type="file"]');
        // 선택만 검증하므로 실제 증빙 객체는 업로드하지 않는다.
        await page.locator('input[type="file"]').setInputFiles([
            {
                name: "proof-a.pdf",
                mimeType: "application/pdf",
                buffer: Buffer.from("%PDF-1.4\nfixture"),
            },
            {
                name: "proof-b.pdf",
                mimeType: "application/pdf",
                buffer: Buffer.from("%PDF-1.4\nfixture"),
            },
        ]);
        await expect(file).toHaveCount(1);
        await page
            .getByRole("button", { name: "proof-a.pdf 선택 제거", exact: true })
            .click();
        await expect(
            page.getByText("proof-a.pdf", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText("proof-b.pdf", { exact: true }),
        ).toBeVisible();
        const headings = await page
            .getByRole("heading", { level: 2 })
            .allTextContents();
        const qualificationsIndex = headings.findIndex((heading) =>
            heading.includes("자격 및 보유 사항"),
        );
        expect(qualificationsIndex).toBeGreaterThan(-1);
        expect(headings.indexOf("자격·경력 증빙 등록")).toBeLessThan(
            qualificationsIndex,
        );
        expect(qualificationsIndex).toBeLessThan(
            headings.indexOf("경력 등록 내역"),
        );
        await page.screenshot({
            path: "test-results/partner-profile-desktop.png",
            fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth,
                ),
            )
            .toBe(true);
        const notice = page.getByText(
            "주민등록번호 뒷자리·주소 등 불필요한 개인정보를 가려 주세요.",
            { exact: false },
        );
        expect(
            await notice.evaluate((element) =>
                Number.parseFloat(getComputedStyle(element).fontSize),
            ),
        ).toBeGreaterThanOrEqual(14);
        await page.screenshot({
            path: "test-results/partner-profile-mobile.png",
            fullPage: true,
        });
        await page
            .locator("section")
            .filter({
                has: page.getByRole("heading", {
                    name: "자격·경력 증빙 등록",
                    exact: true,
                }),
            })
            .screenshot({ path: "test-results/partner-evidence-mobile.png" });
        await page
            .locator("section")
            .filter({
                has: page.getByRole("heading", { name: /자격 및 보유 사항/ }),
            })
            .screenshot({
                path: "test-results/partner-qualifications-mobile.png",
            });
        await page
            .getByRole("button", {
                name: "E2E 자격 대기 등록 취소·증빙 삭제",
                exact: true,
            })
            .click();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "등록 취소", exact: true })
            .click();
        await expect(
            page.getByText("E2E 자격 대기", { exact: true }),
        ).toHaveCount(0);
        await expect(intro).toHaveValue("E2E 실패해도 남는 입력");
    } finally {
        const { error: removeQualificationsError } = await db
            .from("partner_qualifications")
            .delete()
            .in("id", qualificationIds);
        if (removeQualificationsError) throw removeQualificationsError;
        const { error: removeHistoryError } = await db
            .from("partner_work_histories")
            .delete()
            .in("id", historyIds);
        if (removeHistoryError) throw removeHistoryError;
        const { error } = await db
            .from("partner_accounts")
            .update({ intro: account.intro })
            .eq("profile_id", account.profile_id);
        if (error) throw error;
        for (const table of releases) {
            const { error: restoreError } = await db
                .from(table)
                .update({ enabled: previous.get(table) })
                .eq("id", true);
            if (restoreError) throw restoreError;
        }
    }
});

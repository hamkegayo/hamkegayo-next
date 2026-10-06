import { expect, type Page } from "@playwright/test";

import { resetAdminMfa } from "./local-supabase";

/** scripts/seed-dev.mjs · seed-admin.mjs 의 로컬 테스트 계정 */
export const ACCOUNTS = {
    user: { email: "user01@example.com", password: "user1234!" },
    partner: { loginId: "tpart01", password: "tpart1234!", name: "박소연" },
    admin: { email: "admin01@example.com", password: "admin1234!" },
} as const;

/** 테스트가 만드는 예약의 병원명 접두사. global-setup 이 이 예약만 정리한다. */
export const E2E_HOSPITAL_PREFIX = "E2E병원";

/** 쿠키 배너가 버튼을 가리지 않게 먼저 닫는다. */
export async function dismissCookieBanner(page: Page) {
    const reject = page.getByRole("button", { name: "거부", exact: true });
    if (await reject.isVisible().catch(() => false)) await reject.click();
}

export async function loginAsUser(page: Page) {
    await page.goto("/login");
    await dismissCookieBanner(page);
    await page.getByLabel("이메일").fill(ACCOUNTS.user.email);
    await page
        .getByLabel("비밀번호", { exact: true })
        .fill(ACCOUNTS.user.password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
}

export async function loginAsPartner(page: Page) {
    await page.goto("/login");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: "파트너 로그인" }).click();
    await page.locator("#loginId").fill(ACCOUNTS.partner.loginId);
    await page
        .getByLabel("비밀번호", { exact: true })
        .fill(ACCOUNTS.partner.password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).toHaveURL(/\/partner/);
}

/**
 * 관리자 로그인: 비밀번호 → 2단계 인증 등록(화면에 표시된 키로 TOTP 계산) → aal2.
 * 매번 기존 인증기를 지우고 등록부터 하므로 재시도·반복 실행에서도 같은 경로를 탄다.
 */
export async function loginAsAdmin(
    page: Page,
    totp: (secret: string) => string,
) {
    await resetAdminMfa(ACCOUNTS.admin.email);
    await page.goto("/admin/login");
    await dismissCookieBanner(page);
    await page.locator("#admin-email").fill(ACCOUNTS.admin.email);
    await page.locator("#admin-password").fill(ACCOUNTS.admin.password);
    await page.getByRole("button", { name: "다음", exact: true }).click();

    const secret = page
        .locator("p", { hasText: "QR 을 못 읽으면" })
        .locator("span");
    await expect(secret).toBeVisible();
    await page
        .locator("#admin-code")
        .fill(totp((await secret.innerText()).trim()));
    await page.getByRole("button", { name: "등록 완료" }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);
}

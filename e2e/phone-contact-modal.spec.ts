import path from "node:path";

import { devices, expect, test, type Page } from "@playwright/test";

import { COMPANY } from "../lib/legal/company";
import { CONSENT_STORAGE_KEY } from "../lib/consent";
import { dismissCookieBanner, loginAsUser } from "./support/accounts";

/**
 * PC 고객센터 전화 안내 모달 (#304).
 *
 *  - PC(주 포인터 fine): `tel:` 대신 번호·복사·QR·카카오톡 안내 모달
 *  - 모바일(주 포인터 coarse): 모달 없이 `tel:` 기본 동작
 *  - 어느 쪽이든 ContactLink 의 문의 전환 집계(GA contact · Pixel Contact)는 1회
 *
 *  E2E_SCREENSHOT_DIR 를 주면 검증 스크린샷을 남긴다.
 */

const TEL_HREF = `tel:${COMPANY.tel}`;
const SHOT_DIR = process.env.E2E_SCREENSHOT_DIR;

/** KST 상담 시간 안(10:00) · 밖(20:00) */
const IN_HOURS = new Date("2026-11-19T10:00:00+09:00");
const AFTER_HOURS = new Date("2026-11-19T20:00:00+09:00");

async function shot(page: Page, name: string) {
    if (!SHOT_DIR) return;
    await page.screenshot({ path: path.join(SHOT_DIR, name) });
}

/** 모달 밖에 있는 첫 고객센터 전화 링크 */
function phoneLink(page: Page) {
    return page
        .locator(
            `a[href="${TEL_HREF}"]:not([data-testid="phone-contact-modal"] a)`,
        )
        .first();
}

/** 외부 호스트로 나간 요청 (QR 이미지 API 등) */
function watchExternalRequests(page: Page, baseURL: string) {
    const origin = new URL(baseURL).origin;
    const external: string[] = [];
    page.on("request", (req) => {
        const url = req.url();
        if (url.startsWith("data:") || url.startsWith("blob:")) return;
        if (new URL(url).origin !== origin) external.push(url);
    });
    return external;
}

/**
 * 동의를 granted 로 두고 gtag·fbq 호출을 기록한다. 실제 스크립트는 측정 ID 가
 * 없는 E2E 서버에서 로드되지 않는다.
 */
async function recordAnalytics(page: Page) {
    await page.addInitScript((key) => {
        localStorage.setItem(key, "granted");
        const w = window as unknown as {
            __calls: unknown[][];
            gtag: (...a: unknown[]) => void;
            fbq: (...a: unknown[]) => void;
        };
        w.__calls = [];
        w.gtag = (...a) => w.__calls.push(["gtag", ...a]);
        w.fbq = (...a) => w.__calls.push(["fbq", ...a]);
    }, CONSENT_STORAGE_KEY);
}

async function contactCalls(page: Page) {
    return page.evaluate(() => {
        const calls = (window as unknown as { __calls: unknown[][] }).__calls;
        return {
            gtag: calls.filter((c) => c[0] === "gtag" && c[2] === "contact")
                .length,
            fbq: calls.filter((c) => c[0] === "fbq" && c[2] === "Contact")
                .length,
        };
    });
}

async function expectModalContents(page: Page) {
    const modal = page.getByTestId("phone-contact-modal");
    await expect(modal).toBeVisible();
    await expect(
        modal.getByRole("heading", { name: "고객센터 전화 안내" }),
    ).toBeVisible();
    await expect(modal.getByTestId("phone-contact-number")).toHaveText(
        COMPANY.tel,
    );

    // 로컬 SVG QR — <img>·외부 이미지가 아니다
    const qr = modal.getByRole("img", {
        name: `고객센터 전화번호 ${COMPANY.tel} QR 코드`,
    });
    await expect(qr).toBeVisible();
    expect(await qr.evaluate((el) => el.tagName.toLowerCase())).toBe("svg");
    await expect(modal.locator("img")).toHaveCount(0);
    await expect(
        modal.getByText("휴대폰 카메라로 스캔하면 바로 전화가 연결됩니다"),
    ).toBeVisible();

    await expect(modal.getByText(`상담 시간: ${COMPANY.hours}`)).toBeVisible();
    await expect(
        modal.getByText(
            "상담 시간 외에는 전화 연결이 어려울 수 있습니다. 카카오톡으로도 문의하실 수 있습니다.",
        ),
    ).toBeVisible();
    await expect(modal).not.toContainText("평일");
    await expect(modal).not.toContainText("다음 영업일");

    const kakao = modal.getByRole("link", { name: "카카오톡으로 문의하기" });
    await expect(kakao).toHaveAttribute("href", COMPANY.kakaoUrl);
    await expect(kakao).toHaveAttribute("target", "_blank");
    await expect(kakao).toHaveAttribute("rel", "noreferrer noopener");

    await expect(
        modal.getByRole("link", { name: "전화 앱으로 연결" }),
    ).toHaveAttribute("href", TEL_HREF);
    return modal;
}

// 홈의 오픈 이벤트 팝업(#297)은 상태 API 응답 뒤 비동기로 떠서 모달·버튼을 가린다.
// 이 스펙의 대상이 아니므로 꺼진 캠페인으로 응답한다.
test.beforeEach(async ({ page }) => {
    await page.route("**/api/campaigns/opening/status", (route) =>
        route.fulfill({ json: { enabled: false } }),
    );
});

test.describe("PC — 고객센터 전화 버튼이 안내 모달을 연다", () => {
    test.beforeEach(async ({ context, page }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.clock.setFixedTime(IN_HOURS);
    });

    test("주 포인터가 fine 이다 (전제)", async ({ page }) => {
        await page.goto("/");
        expect(
            await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        ).toBe(false);
    });

    test("홈: 모달 내용 · 복사 · 외부 요청 없음 · Esc 닫기", async ({
        page,
        baseURL,
    }) => {
        const external = watchExternalRequests(page, baseURL!);
        await page.goto("/");
        await dismissCookieBanner(page);

        await phoneLink(page).click();
        await expect(page).toHaveURL(new URL("/", baseURL!).href);
        const modal = await expectModalContents(page);
        const badge = modal.getByTestId("phone-contact-hours-badge");
        await expect(badge).toHaveText("현재 상담 시간 내");
        await shot(page, "pc-modal-open.png");

        await modal.getByRole("button", { name: "전화번호 복사" }).click();
        const copied = modal.getByRole("button", { name: "전화번호 복사됨" });
        await expect(copied).toHaveText("복사됨");
        await expect(
            page.getByText("전화번호가 복사되었습니다."),
        ).toBeVisible();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
            COMPANY.tel,
        );
        await shot(page, "pc-modal-copied.png");

        // 약 2초 뒤 원래 상태로
        await expect(
            modal.getByRole("button", { name: "전화번호 복사" }),
        ).toBeVisible({ timeout: 5_000 });

        await page.keyboard.press("Escape");
        await expect(modal).toBeHidden();

        expect(external).toEqual([]);
    });

    for (const pathname of ["/faq", "/refund-policy"]) {
        test(`${pathname}: 전화 버튼 → 모달 → Esc`, async ({
            page,
            baseURL,
        }) => {
            const external = watchExternalRequests(page, baseURL!);
            await page.goto(pathname);
            await dismissCookieBanner(page);
            await phoneLink(page).click();
            const modal = await expectModalContents(page);
            await page.keyboard.press("Escape");
            await expect(modal).toBeHidden();
            expect(external).toEqual([]);
        });
    }

    test("상담 시간 외(KST 20:00)에는 시간 외 배지와 경고 톤", async ({
        page,
    }) => {
        await page.clock.setFixedTime(AFTER_HOURS);
        await page.goto("/");
        await dismissCookieBanner(page);
        await phoneLink(page).click();
        const modal = await expectModalContents(page);
        await expect(modal.getByTestId("phone-contact-hours-badge")).toHaveText(
            "현재 상담 시간 외",
        );
        await expect(modal.getByTestId("phone-contact-hours")).toHaveAttribute(
            "data-within-hours",
            "false",
        );
        await shot(page, "pc-modal-after-hours.png");
    });

    test("ContactLink 집계: GA contact · Pixel Contact 각 1회", async ({
        page,
    }) => {
        await recordAnalytics(page);
        await page.goto("/");
        await phoneLink(page).click();
        await expect(page.getByTestId("phone-contact-modal")).toBeVisible();
        expect(await contactCalls(page)).toEqual({ gtag: 1, fbq: 1 });

        // 모달 안의 "전화 앱으로 연결" 은 집계·모달을 다시 일으키지 않는다
        await page.evaluate(() => {
            window.addEventListener("click", (e) => e.preventDefault(), {
                once: true,
            });
        });
        await page
            .getByTestId("phone-contact-modal")
            .getByRole("link", { name: "전화 앱으로 연결" })
            .click();
        expect(await contactCalls(page)).toEqual({ gtag: 1, fbq: 1 });
    });
});

// 로그인은 실제 시각이 필요하다(고정 시각이면 세션 토큰 시각 검증이 어긋난다).
test.describe("PC — 마이페이지 고객센터", () => {
    test.beforeEach(async ({ context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("/mypage/support: 전화 상담 → 모달", async ({ page }) => {
        await loginAsUser(page);
        await page.goto("/mypage/support");
        await phoneLink(page).click();
        const modal = await expectModalContents(page);
        await modal.getByRole("button", { name: "닫기" }).click();
        await expect(modal).toBeHidden();
    });
});

test.describe("모바일(주 포인터 coarse) — tel: 기본 동작 유지", () => {
    const { defaultBrowserType: _ignored, ...pixel } = devices["Pixel 7"];
    void _ignored;
    test.use(pixel);

    test("모달을 열지 않고 tel: 기본 동작을 막지 않는다 · 집계 1회", async ({
        page,
        baseURL,
    }) => {
        // 동의가 granted 라 쿠키 배너는 뜨지 않는다
        await recordAnalytics(page);
        await page.goto("/");
        expect(
            await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        ).toBe(true);

        // 앱 핸들러(React root) 뒤의 window 버블 단계에서 기본 동작 여부를 기록하고,
        // 실제 tel: 이동은 테스트에서만 막는다.
        await page.evaluate(() => {
            const w = window as unknown as { __telDefaultPrevented?: boolean };
            window.addEventListener(
                "click",
                (e) => {
                    const a = (e.target as Element).closest("a");
                    if (!a?.getAttribute("href")?.startsWith("tel:")) return;
                    w.__telDefaultPrevented = e.defaultPrevented;
                    e.preventDefault();
                },
                { once: true },
            );
        });

        await phoneLink(page).click();
        expect(
            await page.evaluate(
                () =>
                    (window as unknown as { __telDefaultPrevented?: boolean })
                        .__telDefaultPrevented,
            ),
        ).toBe(false);
        await expect(page.getByTestId("phone-contact-modal")).toHaveCount(0);
        await expect(page).toHaveURL(new URL("/", baseURL!).href);
        expect(await contactCalls(page)).toEqual({ gtag: 1, fbq: 1 });
    });
});

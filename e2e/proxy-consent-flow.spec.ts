import { expect, test, type Browser, type Page } from "@playwright/test";

import {
    dismissCookieBanner,
    E2E_HOSPITAL_PREFIX,
    loginAsPartner,
    loginAsUser,
} from "./support/accounts";
import { localSupabaseAdmin } from "./support/local-supabase";

// 대리 예약 이용자 본인 동의 · 대리 동의 사유·권한 확인 (개인정보처리방침 제10조 ①-④, #306)
// 본인 예약 흐름은 reservation-flow.spec.ts(관계 "본인")가 그대로 검증한다.

/** KST 기준 n일 뒤 "YYYY-MM-DD" */
function kstDatePlus(days: number) {
    return new Date(Date.now() + 9 * 3_600_000 + days * 86_400_000)
        .toISOString()
        .slice(0, 10);
}

const DETAIL = "치매 진단으로 의사능력이 제한되어 직접 동의가 어렵습니다.";

async function newUserPage(browser: Browser) {
    const context = await browser.newContext();
    await context.addInitScript(() => {
        localStorage.setItem(
            "hamkegayo-opening-event-dismissed",
            new Intl.DateTimeFormat("sv-SE", {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(new Date()),
        );
    });
    const page = await context.newPage();
    await loginAsUser(page);
    return { context, page };
}

/** 1단계 공통 입력 — 관계는 호출부가 고른다. 이용자 연락처 끝 4자리는 3333, 생년월일은 1950-03-15. */
async function fillStep1Common(page: Page, relation: string) {
    await page.goto("/reservation");
    await page.getByText("위 내용을 확인했습니다.").click();
    await page.getByRole("button", { name: "예약 시작하기" }).click();

    await page.locator("#userName").fill("김동행");
    await page.locator("#userBirth").fill("1950-03-15");
    await page.getByRole("button", { name: "여성" }).click();
    await page.locator("#userPhone").fill("010-2222-3333");
    await page.locator("#guardianName").fill("김보호");
    await page.locator("#guardianPhone").fill("010-4444-5555");
    await page.locator("#relation").selectOption(relation);
    await page.locator("#treatment").fill("정기 진료");
    await page.locator("#purpose").fill("정기 검진");
    await page.locator("#mobilityStatus").selectOption({ index: 1 });
    await page.locator("#cognitiveStatus").selectOption({ index: 1 });
}

/** 2-4단계 입력 후 "매칭 신청하기" 까지 누른다. */
async function fillStep2To4AndSubmit(
    page: Page,
    opts: { hospital: string; date: string },
) {
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.locator("#reservation-step-title")).toBeFocused();

    await page.locator("#useDate").fill(opts.date);
    await page.locator("#arriveTime").selectOption({ label: "10시 00분" });
    await page.locator("#reserveTime").selectOption({ label: "10시 30분" });
    await page.locator("#duration").selectOption({ label: "2시간" });
    await page
        .getByRole("button", { name: "주소 검색", exact: true })
        .first()
        .click();
    await page
        .getByPlaceholder("도로명, 건물명, 지번 (예: 올림픽로43길 88)")
        .fill("세종대로 175");
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await page
        .getByRole("button", { name: /서울특별시 종로구 세종대로 175/ })
        .click();
    await page.locator("#departAddressDetail").fill("1층 안내데스크");
    await page.locator("#hospitalName").fill(opts.hospital);
    await page
        .getByRole("button", { name: "주소 검색", exact: true })
        .last()
        .click();
    await page
        .getByPlaceholder("도로명, 건물명, 지번 (예: 올림픽로43길 88)")
        .fill("연세로 50");
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await page
        .getByRole("button", { name: /서울특별시 서대문구 연세로 50/ })
        .click();
    await page.locator("#transportTo").selectOption({ label: "택시" });
    await page.locator("#transportHome").selectOption({ label: "택시" });
    await page
        .locator("#endMethod")
        .selectOption({ label: "독립 귀가 — 이용자 혼자 귀가" });
    await page.getByRole("button", { name: "다음" }).click();

    await page.getByRole("button", { name: "선택" }).first().click();
    await page.getByRole("button", { name: "다음" }).click();

    await expect(page.getByText(opts.hospital)).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "매칭 신청하기" }).click();
}

/** 서버가 만든 링크는 사이트 주소 기준이라, 테스트 서버 포트에 맞게 경로만 쓴다. */
function consentPath(link: string) {
    return new URL(link).pathname;
}

test("대리 예약 — 이용자 본인 직접 동의: 대기 → 링크 본인 확인 → 동의 → 매칭 해제", async ({
    browser,
}) => {
    const runId = Date.now();
    const hospital = `${E2E_HOSPITAL_PREFIX}${runId % 1_000_000}`;
    const { context: userContext, page: user } = await newUserPage(browser);

    await test.step("보호자: 관계에 따라 동의 방식 선택지가 나타난다", async () => {
        await fillStep1Common(user, "본인");
        // 본인 예약은 기존 흐름 — 동의 방식 선택이 없고 진료내용 전달 동의를 직접 한다.
        await expect(user.locator("#consentMode")).toHaveCount(0);
        await expect(
            user.getByRole("checkbox", {
                name: /진료 내용을 보호자에게 전달하는 데 동의합니다/,
            }),
        ).toBeVisible();

        await user.locator("#relation").selectOption("자녀");
        await expect(user.locator("#consentMode")).toBeVisible();
        await expect(
            user.getByRole("checkbox", {
                name: /진료 내용을 보호자에게 전달하는 데 동의합니다/,
            }),
        ).toHaveCount(0);

        // 동의 방식을 고르지 않으면 다음 단계로 넘어가지 않는다.
        await user.getByRole("button", { name: "다음" }).click();
        await expect(user.locator("#consentMode-error")).toHaveText(
            "동의 방식을 선택해 주세요.",
        );

        // 본인 직접 동의 — 건강정보 동의는 이 화면에서 받지 않는다.
        await user.locator("#consentMode-direct").check();
        await expect(user.locator("#agreePreMatchingHealth")).toHaveCount(0);
        await expect(
            user.locator("#agreePreMatchingHealth-direct-notice"),
        ).toBeVisible();
    });

    await test.step("보호자: 예약 신청 → 본인 동의 대기 화면과 링크", async () => {
        await fillStep2To4AndSubmit(user, {
            hospital,
            date: kstDatePlus(5 + (runId % 50)),
        });
        await expect(
            user.getByText("이용자 본인의 동의를 기다리고 있어요."),
        ).toBeVisible();
        await expect(user.locator("#consent-pending")).toBeVisible();
        await expect(user.locator("#consent-link")).toHaveValue(
            /\/consent\/[A-Za-z0-9_-]{43}$/,
        );
    });

    const first = consentPath(await user.locator("#consent-link").inputValue());

    await test.step("DB: 대기 상태에서는 동의·전달 값이 비어 있다", async () => {
        const { data, error } = await localSupabaseAdmin()
            .from("reservations")
            .select(
                "user_consent_mode, user_consent_status, user_consent_requested_at, user_consent_confirmed_at, pre_matching_health_consented_at, share_medical_info",
            )
            .eq("hospital_name", hospital)
            .single();
        if (error) throw error;
        expect(data).toMatchObject({
            user_consent_mode: "USER_DIRECT",
            user_consent_status: "PENDING_USER",
            user_consent_confirmed_at: null,
            pre_matching_health_consented_at: null,
            share_medical_info: false,
        });
        expect(data.user_consent_requested_at).not.toBeNull();
    });

    await test.step("파트너: 동의 전에는 요청 목록에 보이지 않는다", async () => {
        const partnerContext = await browser.newContext();
        const partner = await partnerContext.newPage();
        await loginAsPartner(partner);
        await partner.goto("/partner/requests");
        await partner.waitForLoadState("networkidle");
        await expect(
            partner.getByRole("link").filter({ hasText: hospital }),
        ).toHaveCount(0);
        await partnerContext.close();
    });

    await test.step("보호자: 링크를 다시 만들면 이전 링크는 폐기된다", async () => {
        await user.locator("#consent-reissue").click();
        await expect(user.locator("#consent-link")).not.toHaveValue(
            new RegExp(first.split("/").pop()!),
        );
        const anon = await browser.newContext();
        const page = await anon.newPage();
        await page.goto(first);
        await expect(page.getByText("새 링크로 교체되었습니다")).toBeVisible();
        await anon.close();
    });

    const second = consentPath(
        await user.locator("#consent-link").inputValue(),
    );

    const anonContext = await browser.newContext();
    const anon = await anonContext.newPage();
    await test.step("이용자 본인: 본인 확인 실패는 거부되고 예약 정보가 보이지 않는다", async () => {
        await anon.goto(second);
        await dismissCookieBanner(anon);
        await anon.locator("#consent-birth").fill("1950-03-16");
        await anon.locator("#consent-phone4").fill("3333");
        await anon.locator("#consent-verify").click();
        await expect(anon.locator("#consent-error")).toContainText(
            "일치하지 않습니다",
        );
        await expect(anon.getByText(hospital)).toHaveCount(0);
    });

    await test.step("이용자 본인: 본인 확인 후 동의 없이는 제출할 수 없고, 동의하면 완료된다", async () => {
        await anon.locator("#consent-birth").fill("1950-03-15");
        await anon.locator("#consent-phone4").fill("3333");
        await anon.locator("#consent-verify").click();
        await expect(anon.getByText(hospital)).toBeVisible();

        await anon.locator("#consent-submit").click();
        await expect(anon.locator("#consent-error")).toContainText(
            "동의하지 않으면 예약을 진행할 수 없습니다",
        );

        await anon.locator("#consent-agree-health").click();
        await anon.locator("#consent-share-medical").click();
        await anon.locator("#consent-submit").click();
        await expect(anon.locator("#consent-done")).toBeVisible();

        // 같은 링크는 다시 쓸 수 없다.
        await anon.goto(second);
        await expect(
            anon.getByText("이미 동의가 완료된 예약입니다"),
        ).toBeVisible();
    });
    await anonContext.close();

    await test.step("DB: 서버 시각·본인이 고른 동의 값이 기록된다", async () => {
        const { data, error } = await localSupabaseAdmin()
            .from("reservations")
            .select(
                "user_consent_status, user_consent_confirmed_at, pre_matching_health_consented_at, pre_matching_health_consent_version, share_medical_info",
            )
            .eq("hospital_name", hospital)
            .single();
        if (error) throw error;
        expect(data.user_consent_status).toBe("CONFIRMED");
        expect(data.user_consent_confirmed_at).not.toBeNull();
        expect(data.pre_matching_health_consented_at).not.toBeNull();
        expect(data.pre_matching_health_consent_version).toMatch(
            /^\d{4}-\d{2}-\d{2}$/,
        );
        expect(data.share_medical_info).toBe(true);
    });

    await test.step("보호자: 동의가 확인되면 매칭 대기 화면으로 넘어간다", async () => {
        // 동의 대기 화면은 5초 주기로 상태를 다시 읽는다.
        await expect(user.getByText("파트너를 찾고 있습니다.")).toBeVisible({
            timeout: 30_000,
        });
    });

    await test.step("파트너: 동의 후에는 요청 목록에 보인다", async () => {
        const partnerContext = await browser.newContext();
        const partner = await partnerContext.newPage();
        await loginAsPartner(partner);
        await partner.goto("/partner/requests");
        await expect(
            partner.getByRole("link").filter({ hasText: hospital }),
        ).toBeVisible();
        await partnerContext.close();
    });
    await userContext.close();
});

test("대리 예약 — 보호자 대리 동의(예외): 사유·권한 서약이 필수이고 잘못된 입력은 거절된다", async ({
    browser,
}) => {
    const runId = Date.now();
    const hospital = `${E2E_HOSPITAL_PREFIX}${runId % 1_000_000}`;
    const { context: userContext, page: user } = await newUserPage(browser);

    await fillStep1Common(user, "자녀");
    await user.locator("#consentMode-proxy").check();

    await test.step("사유·상세·서약·건강정보 동의가 없으면 넘어가지 않는다", async () => {
        await user.getByRole("button", { name: "다음" }).click();
        await expect(user.locator("#proxyReasonCode-error")).toHaveText(
            "대리 동의가 필요한 사유를 선택해 주세요.",
        );
        await expect(user.locator("#proxyReasonDetail-error")).toContainText(
            "10자 이상",
        );
        await expect(user.locator("#proxyAuthorityPledge-error")).toHaveText(
            "대리 권한 확인에 동의해 주세요.",
        );
        await expect(
            user.locator("#agreePreMatchingHealth-error"),
        ).toBeVisible();
        await expect(user.locator("#userName")).toBeVisible();
    });

    await test.step("너무 짧은 사유는 거절된다", async () => {
        await user.locator("#proxyReasonCode").selectOption({ index: 1 });
        await user.locator("#proxyReasonDetail").fill("짧음");
        await user.locator("#proxyAuthorityPledge").click();
        await user
            .getByRole("checkbox", {
                name: /거동·인지 상태.*매칭 전 파트너에게 제공하는 데 동의합니다/,
            })
            .check();
        await user.getByRole("button", { name: "다음" }).click();
        await expect(user.locator("#proxyReasonDetail-error")).toContainText(
            "10자 이상",
        );
        await expect(user.locator("#userName")).toBeVisible();
    });

    await test.step("유효한 사유·서약이면 진행되고, 본인 동의 대기 없이 바로 매칭된다", async () => {
        await user.locator("#proxyReasonDetail").fill(DETAIL);
        await fillStep2To4AndSubmit(user, {
            hospital,
            date: kstDatePlus(5 + (runId % 50)),
        });
        await expect(user.getByText("파트너를 찾고 있습니다.")).toBeVisible();
        await expect(user.locator("#consent-pending")).toHaveCount(0);
    });

    await test.step("DB: 사유·서약 기록, 서버 시각, 진료내용 전달 동의 false", async () => {
        const { data, error } = await localSupabaseAdmin()
            .from("reservations")
            .select(
                "user_consent_mode, user_consent_status, user_consent_confirmed_at, proxy_reason_code, proxy_reason_detail, proxy_authority_confirmed_at, proxy_authority_version, share_medical_info, pre_matching_health_consented_at",
            )
            .eq("hospital_name", hospital)
            .single();
        if (error) throw error;
        expect(data).toMatchObject({
            user_consent_mode: "GUARDIAN_PROXY",
            user_consent_status: "CONFIRMED",
            proxy_reason_detail: DETAIL,
            share_medical_info: false,
        });
        expect(data.proxy_reason_code).toBe("LACKS_CAPACITY");
        expect(data.user_consent_confirmed_at).not.toBeNull();
        expect(data.proxy_authority_confirmed_at).not.toBeNull();
        expect(data.proxy_authority_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(data.pre_matching_health_consented_at).not.toBeNull();
    });
    await userContext.close();
});

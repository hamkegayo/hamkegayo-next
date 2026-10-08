import { expect, test } from "@playwright/test";

import { E2E_PAYMENT } from "../playwright.config";
import {
    ACCOUNTS,
    E2E_HOSPITAL_PREFIX,
    loginAsAdmin,
    loginAsPartner,
    loginAsUser,
} from "./support/accounts";
import { mockNicepaySdk } from "./support/nicepay-sdk";
import { totp } from "./support/totp";

/** KST 기준 n일 뒤 "YYYY-MM-DD" */
function kstDatePlus(days: number) {
    return new Date(Date.now() + 9 * 3_600_000 + days * 86_400_000)
        .toISOString()
        .slice(0, 10);
}

// 핵심 흐름: 이용자 예약 → 파트너 수락 → 이용자 선택·선결제(모의 PG) → 예약 확정 → 관리자 확인
test("예약부터 파트너 수락, 모의 결제, 관리자 확인까지", async ({
    browser,
}) => {
    // 실행마다 고유한 병원 이름으로 이 테스트의 예약만 집는다.
    const runId = Date.now();
    const hospital = `${E2E_HOSPITAL_PREFIX}${runId % 1_000_000}`;

    const userContext = await browser.newContext();
    await userContext.addInitScript(() => {
        // 30초 자동 팝업 갱신이 예약 흐름의 접근성 트리를 가리지 않도록 당일 닫기를 설정한다.
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
    const user = await userContext.newPage();
    await mockNicepaySdk(user, E2E_PAYMENT.secretKey);
    // API 응답 실패 후 쿠폰 선택 해제·상태 재조회만 모의한다. 실제 PG 경로는 이후 그대로 실행한다.
    let unavailableAttempt = false;
    await user.route("**/api/campaigns/opening/offer?*", async (route) => {
        await route.fulfill({
            json: !unavailableAttempt
                ? { eligible: true, state: "AVAILABLE", discount: 25000 }
                : { eligible: false, state: "PAUSED", discount: 25000 },
        });
    });
    await user.route("**/api/payments/prepare", async (route) => {
        if (route.request().postDataJSON()?.useOpeningEvent) {
            unavailableAttempt = true;
            await route.fulfill({
                status: 409,
                json: {
                    code: "CAMPAIGN_UNAVAILABLE",
                    error: "쿠폰 사용이 일시 중지되었습니다.",
                },
            });
        } else await route.continue();
    });

    await test.step("이용자: 로그인 후 예약 신청", async () => {
        await loginAsUser(user);
        await user.goto("/reservation");
        await user.getByText("위 내용을 확인했습니다.").click();
        await user.getByRole("button", { name: "예약 시작하기" }).click();

        // 1. 이용자 정보
        await user.locator("#userName").fill("김동행");
        await user.locator("#userBirth").fill("1950-03-15");
        await user.getByRole("button", { name: "여성" }).click();
        await user.locator("#userPhone").fill("010-2222-3333");
        await user.locator("#guardianName").fill("김보호");
        await user.locator("#guardianPhone").fill("010-4444-5555");
        await user.locator("#relation").selectOption("자녀");
        await user.locator("#treatment").fill("정기 진료");
        await user.locator("#purpose").fill("정기 검진");
        await user.locator("#mobilityStatus").selectOption({ index: 1 });
        await user.locator("#cognitiveStatus").selectOption({ index: 1 });
        await user.getByRole("button", { name: "다음" }).click();

        // 2. 병원 정보 — 사전 예약 기간(59일)·서비스 시간(07~19시) 안.
        // 같은 파트너의 예약과 시간이 겹치면 선택이 거절된다(partner_unavailable).
        // 이전 실행 예약은 global-setup 이 정리하고, 재시도끼리 겹치지 않게 이용일도 바꾼다.
        await user.locator("#useDate").fill(kstDatePlus(5 + (runId % 50)));
        await user.locator("#arriveTime").selectOption({ label: "10시 00분" });
        await user.locator("#reserveTime").selectOption({ label: "10시 30분" });
        await user.locator("#duration").selectOption({ label: "2시간" });
        await user
            .locator("#departAddress")
            .fill("서울특별시 종로구 세종대로 175");
        await user.locator("#hospitalName").fill(hospital);
        await user
            .locator("#hospitalAddress")
            .fill("서울특별시 서대문구 연세로 50");
        await user.locator("#transportTo").selectOption({ label: "택시" });
        await user.locator("#transportHome").selectOption({ label: "택시" });
        await user
            .locator("#endMethod")
            .selectOption({ label: "독립 귀가 — 이용자 혼자 귀가" });
        await user.getByRole("button", { name: "다음" }).click();

        // 3. 서비스 — 베이직(시간당 20,000원)
        await user.getByRole("button", { name: "선택" }).first().click();
        await user.getByRole("button", { name: "다음" }).click();

        // 4. 확인 후 신청
        await expect(user.getByText(hospital)).toBeVisible();
        await user.getByRole("checkbox").check();
        await user.getByRole("button", { name: "매칭 신청하기" }).click();
        await expect(user.getByText("파트너를 찾고 있습니다.")).toBeVisible();
    });

    await test.step("파트너: 요청 수락", async () => {
        const partnerContext = await browser.newContext();
        const partner = await partnerContext.newPage();
        await loginAsPartner(partner);
        await partner.goto("/partner/requests");
        await partner.getByRole("link").filter({ hasText: hospital }).click();
        await partner.getByRole("button", { name: /수락하기/ }).click();
        await expect(partner.getByText("요청을 수락했습니다.")).toBeVisible();
        await partnerContext.close();
    });

    await test.step("이용자: 파트너 선택 후 선결제(모의 PG)", async () => {
        // 매칭 화면은 5초 주기로 다시 조회한다.
        await expect(user.getByText(ACCOUNTS.partner.name)).toBeVisible({
            timeout: 30_000,
        });
        await user.getByRole("button", { name: "다음 단계로 이동" }).click();

        await user.getByRole("button", { name: "이 파트너로 선택" }).click();
        await user.getByRole("button", { name: "선택하고 결제하기" }).click();

        // 2시간 × 20,000원, 주말·공휴일 할증 0%(#206)
        const pay = user.getByRole("button", { name: "40,000원 결제하기" });
        await expect(pay).toBeVisible();
        await user.getByRole("checkbox", { name: /취소·환불 정책/ }).check();
        await user.getByRole("checkbox", { name: /쿠폰.*25,000원/ }).check();
        await user.getByRole("button", { name: "15,000원 결제하기" }).click();
        await expect(
            user.getByText("현재 쿠폰 사용이 일시 중지되었습니다.", {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            user.getByRole("checkbox", { name: /쿠폰.*25,000원/ }),
        ).toHaveCount(0);
        await expect(pay).toBeEnabled();
        await pay.click();

        // 모의 결제창 → /api/payments/confirm(서명·금액 검증, 모의 PG 승인) → 완료 화면
        await expect(user).toHaveURL(/pay=done/, { timeout: 60_000 });
        await expect(
            user.getByRole("heading", {
                level: 1,
                name: /예약이 확정되었습니다/,
            }),
        ).toBeVisible();
    });
    await userContext.close();

    await test.step("관리자: 2단계 인증 후 예약 집계·접속기록 확인", async () => {
        const adminContext = await browser.newContext();
        const admin = await adminContext.newPage();
        await loginAsAdmin(admin, totp);

        // 관리자 홈은 aal2 에서만 열리는 예약 조회 RPC 로 건수를 세고, 조회 접속기록을 남긴다.
        await expect(admin.getByText("2단계 인증 완료")).toBeVisible();
        await expect(admin.getByText("예약 목록 조회").first()).toBeVisible();
        await adminContext.close();
    });
});

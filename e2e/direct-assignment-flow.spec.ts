import { expect, test, type Browser, type Page } from "@playwright/test";

import { E2E_PAYMENT } from "../playwright.config";
import {
    ACCOUNTS,
    E2E_HOSPITAL_PREFIX,
    loginAsAdmin,
    loginAsPartner,
    loginAsUser,
} from "./support/accounts";
import {
    deleteE2eReservations,
    deleteSecondPartner,
    E2E_SECOND_PARTNER,
    ensureSecondPartner,
    localSupabaseAdmin,
} from "./support/local-supabase";
import { mockNicepaySdk } from "./support/nicepay-sdk";
import { totp } from "./support/totp";

/**
 * 선결제 후 운영자 직접 배정 흐름 (#300) — 피처 플래그 켜짐 실행에서만 수집된다(playwright.config.ts).
 * 선결제(모의 PG) → 매칭 대기 → 관리자 배정·재배정 / 매칭 실패·전액 환불 / 배정 전 고객 취소.
 * NICEPAY 는 모의 서버·모의 결제창, 메일(Resend)은 키를 비워 호출하지 않는다.
 */

/** KST 기준 n일 뒤 "YYYY-MM-DD" */
function kstDatePlus(days: number) {
    return new Date(Date.now() + 9 * 3_600_000 + days * 86_400_000)
        .toISOString()
        .slice(0, 10);
}

const db = () => localSupabaseAdmin();

async function newUserPage(browser: Browser) {
    const context = await browser.newContext();
    await context.addInitScript(() => {
        localStorage.setItem(
            "hamkegayo-opening-event-dismissed",
            new Intl.DateTimeFormat("sv-SE", {
                timeZone: "Asia/Seoul",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(new Date()),
        );
    });
    const page = await context.newPage();
    await mockNicepaySdk(page, E2E_PAYMENT.secretKey);
    // 결제 승인 콜백(POST /api/payments/confirm)을 기록해 재전송 멱등 검증에 쓴다.
    const confirms: { url: string; body: string; contentType: string }[] = [];
    page.on("request", (req) => {
        if (
            req.method() === "POST" &&
            req.url().includes("/api/payments/confirm")
        ) {
            confirms.push({
                url: req.url(),
                body: req.postData() ?? "",
                contentType: req.headers()["content-type"] ?? "",
            });
        }
    });
    await loginAsUser(page);
    return { context, page, confirms };
}

/** 예약 입력 STEP1-4 를 마치고 "예약 신청하고 결제하기" 까지 누른다. 결제 화면(STEP7)이 열린다. */
async function fillReservationAndSubmit(
    page: Page,
    opts: { hospital: string; date: string; arrive: string; reserve: string },
) {
    await page.goto("/reservation");
    await page.getByText("위 내용을 확인했습니다.").click();
    await page.getByRole("button", { name: "예약 시작하기" }).click();

    await page.locator("#userName").fill("김동행");
    await page.locator("#userBirth").fill("1950-03-15");
    await page.getByRole("button", { name: "여성" }).click();
    await page.locator("#userPhone").fill("010-2222-3333");
    await page.locator("#guardianName").fill("김보호");
    await page.locator("#guardianPhone").fill("010-4444-5555");
    await page.locator("#relation").selectOption("자녀");
    await page.locator("#treatment").fill("정기 진료");
    await page.locator("#purpose").fill("정기 검진");
    await page.locator("#mobilityStatus").selectOption({ index: 1 });
    await page.locator("#cognitiveStatus").selectOption({ index: 1 });
    await page.getByRole("button", { name: "다음" }).click();

    await page.locator("#useDate").fill(opts.date);
    await page.locator("#arriveTime").selectOption({ label: opts.arrive });
    await page.locator("#reserveTime").selectOption({ label: opts.reserve });
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
    // 신규 방식: 파트너 지원 대기·선택 없이 바로 결제로 간다.
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "예약 신청하고 결제하기" }).click();
}

/** 결제 화면에서 쿠폰 없이 결제하고 완료 화면까지 간다. */
async function pay(page: Page) {
    const payButton = page.getByRole("button", { name: "40,000원 결제하기" });
    await expect(payButton).toBeVisible({ timeout: 30_000 });
    await page.getByRole("checkbox", { name: /취소·환불 정책/ }).check();
    await payButton.click();
    await expect(page.getByTestId("direct-complete-notice")).toBeVisible({
        timeout: 60_000,
    });
}

async function reservationByHospital(hospital: string) {
    const { data, error } = await db()
        .from("reservations")
        .select(
            "id, code, status, matching_mode, paid_at, confirmed_partner_id, match_failed_at, failure_notice_at, partner_accepted_channel",
        )
        .eq("hospital_name", hospital)
        .single();
    if (error) throw error;
    return data;
}

async function openAdminDetail(admin: Page, id: string) {
    await admin.goto(`/admin/reservations/${id}`);
    await expect(
        admin.getByRole("heading", { level: 1, name: /^예약 / }),
    ).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("선결제 → 매칭 대기 → 관리자 배정(#300)", () => {
    let secondPartnerId = "";

    test.beforeAll(async () => {
        await deleteE2eReservations(E2E_HOSPITAL_PREFIX);
        secondPartnerId = await ensureSecondPartner();
    });
    test.afterAll(async () => {
        await deleteE2eReservations(E2E_HOSPITAL_PREFIX);
        await deleteSecondPartner();
    });

    test("파트너 선택 없이 선결제 → 확정 미표시 → 관리자 배정·재배정", async ({
        browser,
    }) => {
        const hospital = `${E2E_HOSPITAL_PREFIX}${Date.now() % 1_000_000}`;
        const { context, page: user, confirms } = await newUserPage(browser);
        let id = "";

        await test.step("이용자: 신청 후 파트너 선택 단계 없이 결제", async () => {
            await fillReservationAndSubmit(user, {
                hospital,
                date: kstDatePlus(9),
                arrive: "10시 00분",
                reserve: "10시 30분",
            });
            // 결제 화면(6단계 중 5단계)에는 파트너 선택·결제 기한 카운트다운이 없고, 취소 안내가 있다.
            await expect(
                user.getByRole("heading", {
                    level: 1,
                    name: /5\. 결제를 진행해주세요/,
                }),
            ).toBeVisible({ timeout: 30_000 });
            await expect(user.getByText("결제 남은 시간")).toHaveCount(0);
            await expect(
                user.getByText("나중에 결제하기 (예약 현황으로)"),
            ).toHaveCount(0);
            await expect(
                user.getByText(/파트너 배정 전에는 언제든 취소할 수 있으며/),
            ).toBeVisible({ timeout: 30_000 });
            await expect(
                user.locator('[data-urgent="false"]').first(),
            ).toBeVisible();
            await pay(user);
        });

        await test.step("결제 직후: 확정이 아니라 매칭 대기 안내", async () => {
            const r = await reservationByHospital(hospital);
            id = r.id;
            expect(r.matching_mode).toBe("admin_direct");
            expect(r.status).toBe("MATCHING");
            expect(r.paid_at).not.toBeNull();
            expect(r.confirmed_partner_id).toBeNull();

            await expect(
                user.getByRole("heading", {
                    level: 1,
                    name: /6\. 예약 신청이 접수되었습니다/,
                }),
            ).toBeVisible();
            await expect(
                user.getByRole("heading", { name: /예약이 확정되었습니다/ }),
            ).toHaveCount(0);
            const notice = user.getByTestId("direct-complete-notice");
            await expect(notice).toContainText(
                "예약 신청 및 결제가 완료되었습니다.",
            );
            await expect(notice).toContainText("24시간 이내에");
            await expect(notice).toContainText("전액 환불됩니다");
            const callLink = notice.getByRole("link", {
                name: "고객센터 전화하기",
            });
            await expect(callLink).toHaveAttribute("href", /^tel:/);
            await expect(callLink).toHaveText("고객센터 전화하기");
            const steps = user.getByTestId("direct-complete-steps");
            await expect(steps).toContainText("① 접수·결제 완료(현재)");
            await expect(steps).toContainText("② 24시간 이내 파트너 확인");
            await expect(steps).toContainText("③ 담당 파트너 확정 문자 안내");
            await expect(steps).toContainText(
                "이 화면을 닫으셔도 예약 접수와 파트너 배정은 정상적으로 진행됩니다.",
            );
            await expect(user.getByText(r.code)).toBeVisible();

            const { data: pays } = await db()
                .from("payments")
                .select("status")
                .eq("reservation_id", id);
            expect(pays?.map((p) => p.status)).toEqual(["PAID"]);
        });

        await test.step("재호출 멱등: 결제 완료 화면을 다시 열어도 결제·접수 기록이 늘지 않는다", async () => {
            // 같은 승인 콜백을 그대로 다시 보낸다(결제창 재전송·새로고침). 새 결제·접수를 만들지 않고 완료로 돌려보낸다.
            const cb = confirms[0];
            expect(cb).toBeTruthy();
            const replay = await user.request.post(cb.url, {
                data: cb.body,
                headers: { "content-type": cb.contentType },
                maxRedirects: 0,
            });
            expect(replay.status()).toBe(303);
            expect(replay.headers().location ?? "").toMatch(/pay=done/);
            const { data: pays } = await db()
                .from("payments")
                .select("id")
                .eq("reservation_id", id);
            expect(pays).toHaveLength(1);
            const { data: intakes } = await db()
                .from("reservation_intakes")
                .select("id")
                .eq("reservation_id", id);
            expect(intakes).toHaveLength(1);
        });

        await test.step("파트너: 배정 전에는 이 예약을 볼 수 없다", async () => {
            const pc = await browser.newContext();
            const partner = await pc.newPage();
            await loginAsPartner(partner);
            await partner.goto("/partner/requests");
            await expect(
                partner.getByRole("link").filter({ hasText: hospital }),
            ).toHaveCount(0);
            await pc.close();
        });

        const adminContext = await browser.newContext();
        const admin = await adminContext.newPage();
        await loginAsAdmin(admin, totp);

        await test.step("관리자: 배정 대기 목록 → 상세, 수락 확인 없이는 배정 불가", async () => {
            await admin.goto("/admin/reservations");
            await expect(
                admin
                    .getByRole("link")
                    .filter({ hasText: /결제 완료/ })
                    .first(),
            ).toBeVisible();
            await openAdminDetail(admin, id);
            await expect(
                admin.getByRole("button", { name: "배정하고 예약 확정" }),
            ).toBeDisabled();
            await admin
                .locator("select")
                .first()
                .selectOption({ label: ACCOUNTS.partner.name });
            // 외부 연락으로 수락을 확인했다는 체크 전에는 비활성
            await expect(
                admin.getByRole("button", { name: "배정하고 예약 확정" }),
            ).toBeDisabled();
        });

        await test.step("관리자: 수락 확인 후 배정 → 예약 확정", async () => {
            await admin
                .getByRole("checkbox", { name: /수락 의사를 직접/ })
                .check();
            await admin
                .getByRole("button", { name: "배정하고 예약 확정" })
                .click();
            await expect
                .poll(
                    async () => (await reservationByHospital(hospital)).status,
                )
                .toBe("CONFIRMED");
            const r = await reservationByHospital(hospital);
            expect(r.confirmed_partner_id).not.toBe(secondPartnerId);
            expect(r.confirmed_partner_id).not.toBeNull();
            expect(r.partner_accepted_channel).toBe("PHONE");
        });

        await test.step("이용자·담당 파트너: 확정된 예약이 보인다", async () => {
            await user.goto(`/mypage/reservations/${id}`);
            await expect(user.getByText("파트너 확정").first()).toBeVisible();
            await expect(
                user.getByText(ACCOUNTS.partner.name).first(),
            ).toBeVisible();

            const pc = await browser.newContext();
            const partner = await pc.newPage();
            await loginAsPartner(partner);
            await partner.goto("/partner/management");
            await expect(partner.getByText("연세로 50").first()).toBeVisible();
            await pc.close();
        });

        await test.step("관리자: 서비스 시작 전 재배정 → 이전 담당자는 더 볼 수 없다", async () => {
            await openAdminDetail(admin, id);
            await admin
                .locator("select")
                .first()
                .selectOption({ label: E2E_SECOND_PARTNER.name });
            await admin
                .getByRole("checkbox", { name: /수락 의사를 직접/ })
                .check();
            await admin
                .getByRole("button", { name: "담당 파트너 변경" })
                .click();
            await expect
                .poll(
                    async () =>
                        (await reservationByHospital(hospital))
                            .confirmed_partner_id,
                )
                .toBe(secondPartnerId);

            const { data: events } = await db()
                .from("reservation_events")
                .select("event_type")
                .eq("reservation_id", id)
                .order("id");
            expect(events?.map((e) => e.event_type)).toEqual(
                expect.arrayContaining(["PAID", "ASSIGNED", "REASSIGNED"]),
            );

            // 이전 담당자(시드 파트너)는 RLS 로 이 예약에 접근할 수 없다.
            const pc = await browser.newContext();
            const old = await pc.newPage();
            await loginAsPartner(old);
            await old.goto("/partner/management");
            await expect(old.getByText("연세로 50")).toHaveCount(0);
            await pc.close();
        });

        await test.step("서비스 시작 후에는 재배정이 막힌다", async () => {
            const { error } = await db()
                .from("services")
                .update({
                    status: "IN_PROGRESS",
                    started_at: new Date().toISOString(),
                })
                .eq("reservation_id", id);
            if (error) throw error;
            await openAdminDetail(admin, id);
            await expect(
                admin.getByText(/이미 시작되었거나 끝나 재배정할 수 없습니다/),
            ).toBeVisible();
            await expect(
                admin.getByRole("button", { name: "담당 파트너 변경" }),
            ).toHaveCount(0);
        });

        await adminContext.close();
        await context.close();
    });

    test("24시간 미만 급한 예약 경고·결제 허용, 매칭 실패 → 전액 환불·안내 기록 분리", async ({
        browser,
    }) => {
        const hospital = `${E2E_HOSPITAL_PREFIX}${(Date.now() + 1) % 1_000_000}`;
        const { context, page: user } = await newUserPage(browser);
        // KST 내일 07:00 은 오늘 07:00(KST) 이후에는 항상 24시간 미만이다. 그 전이면 경고가 꺼진 상태를 확인한다.
        const nowKstHour = (new Date().getUTCHours() + 9) % 24;
        const expectUrgent = nowKstHour >= 7;

        await test.step("이용자: 급한 예약 경고 강조 후에도 결제 가능", async () => {
            await fillReservationAndSubmit(user, {
                hospital,
                date: kstDatePlus(1),
                arrive: "7시 00분",
                reserve: "8시 00분",
            });
            await expect(
                user.locator(`[data-urgent="${expectUrgent}"]`).first(),
            ).toBeVisible({ timeout: 30_000 });
            if (expectUrgent) {
                await expect(
                    user.getByText(/24시간 미만입니다/).first(),
                ).toBeVisible();
            }
            await pay(user);
            // 완료 화면에도 같은 경고가 남되, 결제 완료 후 문맥으로 표시된다.
            await expect(
                user.locator(`[data-urgent="${expectUrgent}"]`).first(),
            ).toBeVisible();
            await expect(
                user.getByText("온라인 결제는 그대로 진행하실 수 있습니다"),
            ).toHaveCount(0);
        });

        const r = await reservationByHospital(hospital);
        const adminContext = await browser.newContext();
        const admin = await adminContext.newPage();
        await loginAsAdmin(admin, totp);

        await test.step("관리자: 매칭 실패 처리 → PG 전액 환불", async () => {
            await openAdminDetail(admin, r.id);
            await admin
                .getByRole("textbox", { name: /실패 사유/ })
                .fill("E2E 배정 가능한 파트너 없음");
            await expect(
                admin.getByRole("button", {
                    name: "매칭 실패 처리 및 전액 환불",
                }),
            ).toBeDisabled();
            await admin
                .getByRole("checkbox", { name: /매칭 실패로 처리하고/ })
                .check();
            await admin
                .getByRole("button", { name: "매칭 실패 처리 및 전액 환불" })
                .click();
            await expect(
                admin.getByText("PG 전액 환불까지 완료했습니다."),
            ).toBeVisible({ timeout: 30_000 });

            const after = await reservationByHospital(hospital);
            expect(after.status).toBe("CANCELLED");
            expect(after.match_failed_at).not.toBeNull();
            // 환불(PG)과 고객 안내는 별개 — 환불이 끝나도 안내는 아직이다.
            expect(after.failure_notice_at).toBeNull();
            const { data: refund } = await db()
                .from("reservation_refunds")
                .select("status, reason, amount_cash")
                .eq("reservation_id", r.id)
                .single();
            expect(refund).toMatchObject({
                status: "REFUNDED",
                reason: "MATCH_FAILED",
                amount_cash: 40000,
            });
        });

        await test.step("관리자: 실패 안내 완료 기록은 환불 상태와 따로 남는다", async () => {
            await openAdminDetail(admin, r.id);
            await expect(admin.getByText("환불 완료").first()).toBeVisible();
            await expect(admin.getByText("아직 안내하지 않음")).toBeVisible();
            await admin
                .getByRole("checkbox", { name: /매칭 실패와 환불 안내를 직접/ })
                .check();
            await admin
                .getByRole("button", { name: "실패 안내 완료 기록" })
                .click();
            await expect(
                admin.getByText("고객 실패 안내 완료를 기록했습니다."),
            ).toBeVisible();
            const after = await reservationByHospital(hospital);
            expect(after.failure_notice_at).not.toBeNull();
            const { data: refund } = await db()
                .from("reservation_refunds")
                .select("status")
                .eq("reservation_id", r.id)
                .single();
            expect(refund?.status).toBe("REFUNDED");
        });

        await test.step("이용자: 취소·환불 상태가 보인다", async () => {
            await user.goto(`/mypage/reservations/${r.id}`);
            await expect(user.getByTestId("direct-phase-badge")).toBeVisible();
            await expect(
                user.getByRole("button", { name: /예약 취소/ }),
            ).toHaveCount(0);
        });

        await adminContext.close();
        await context.close();
    });

    test("배정 전 고객 취소 → 전액 환불, 이후 관리자 배정은 막힌다", async ({
        browser,
    }) => {
        const hospital = `${E2E_HOSPITAL_PREFIX}${(Date.now() + 2) % 1_000_000}`;
        const { context, page: user } = await newUserPage(browser);

        await fillReservationAndSubmit(user, {
            hospital,
            date: kstDatePlus(12),
            arrive: "10시 00분",
            reserve: "10시 30분",
        });
        await pay(user);
        const r = await reservationByHospital(hospital);

        await test.step("이용자: 배정 전 취소 → 전액 환불", async () => {
            await user.goto(`/mypage/reservations/${r.id}`);
            await user
                .getByRole("button", { name: "예약 취소(전액 환불)" })
                .click();
            await user
                .getByRole("button", { name: "예약 취소", exact: true })
                .last()
                .click();
            await expect
                .poll(
                    async () => (await reservationByHospital(hospital)).status,
                )
                .toBe("CANCELLED");
            const { data: refund } = await db()
                .from("reservation_refunds")
                .select("status, reason, amount_cash")
                .eq("reservation_id", r.id)
                .single();
            expect(refund).toMatchObject({
                status: "REFUNDED",
                reason: "CUSTOMER_CANCEL",
                amount_cash: 40000,
            });
        });

        await test.step("취소된 예약은 배정되지 않는다(이중 확정 방지)", async () => {
            const { error } = await db().rpc("admin_assign_partner", {
                p_reservation: r.id,
                p_partner: secondPartnerId,
                p_accepted_channel: "PHONE",
                p_expected_action: "ASSIGN",
            });
            // service_role 에는 관리자 권한이 없거나 상태가 맞지 않아 거절된다.
            expect(error).not.toBeNull();
            expect((await reservationByHospital(hospital)).status).toBe(
                "CANCELLED",
            );
        });

        await context.close();
    });
});

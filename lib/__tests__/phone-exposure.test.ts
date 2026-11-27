import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COMPANY } from "@/lib/legal/company";
import { FaqContactCta } from "@/app/(user)/faq/_components/faq-contact-cta";
import RefundPolicyPage from "@/app/(user)/refund-policy/page";
import MypageSupport from "@/app/(user)/mypage/support/page";
import PayResultPage from "@/app/pay/result/page";

/**
 * 고객센터 전화번호 노출 제거 (#319) — 버튼·링크·안내 카드 텍스트에 번호가 없다.
 *
 *  번호는 `tel:` href 에만 남고, PC 에서는 PhoneContactLink 가 안내 모달(번호·QR)을
 *  연다(#304). 푸터·약관·처리방침의 사업자정보 표기는 법정 표시사항이라 대상이 아니다.
 */

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
    renderToStaticMarkup(el);

/** href="tel:..." 속성을 제외한 화면 노출 텍스트 */
function visibleMarkup(markup: string) {
    return markup.replaceAll(`tel:${COMPANY.tel}`, "tel:REDACTED");
}

/** 소스에서 `tel:${COMPANY.tel}` href 를 빼고도 COMPANY.tel 이 남아 있으면 번호를 그리는 것이다 */
function srcWithoutTelHref(path: string) {
    return readFileSync(resolve(process.cwd(), path), "utf8").replaceAll(
        "`tel:${COMPANY.tel}`",
        "",
    );
}

describe("고객센터 전화번호 노출 제거 (#319)", () => {
    it("FAQ 하단 CTA — 버튼은 '전화 상담 받기' 이고 번호를 그리지 않는다", () => {
        const m = html(createElement(FaqContactCta));
        expect(m).toContain("전화 상담 받기");
        expect(m).toContain(`href="tel:${COMPANY.tel}"`);
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });

    it("취소·환불 정책 — 문의 링크는 문구이고 운영시간은 유지한다", () => {
        const m = html(createElement(RefundPolicyPage));
        expect(m).toContain("전화 문의하기");
        expect(m).toContain(COMPANY.hours);
        expect(m).toContain(`href="tel:${COMPANY.tel}"`);
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });

    it("마이페이지 고객센터 — 전화 채널은 문구이고 상담 시간은 유지한다", () => {
        const m = html(createElement(MypageSupport));
        expect(m).toContain("전화 상담 받기");
        expect(m).toContain(COMPANY.hours);
        expect(m).toContain(`href="tel:${COMPANY.tel}"`);
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });

    it("추가결제 결과 화면 — 번호 없이 전화 문의 버튼과 운영시간을 둔다", async () => {
        // PayShell 의 푸터는 전자상거래법 표시사항(번호 포함)이라 본문(main)만 본다.
        const full = html(
            await PayResultPage({
                searchParams: Promise.resolve({ status: "fail" }),
            }),
        );
        const m = full.slice(full.indexOf("<main"), full.indexOf("</main>"));
        expect(m).toContain("전화 문의하기");
        expect(m).toContain(COMPANY.hours);
        expect(m).toContain(`href="tel:${COMPANY.tel}"`);
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });

    // 서버 데이터·클라이언트 훅에 묶여 렌더가 무거운 화면은 소스에서 확인한다.
    it.each([
        ["추가결제 링크 페이지", "app/pay/[token]/page.tsx", "전화 문의하기"],
        [
            "파트너 사이드바",
            "app/(partner)/_components/partner-sidebar.tsx",
            "전화하기",
        ],
        [
            "파트너 프로필",
            "app/(partner)/partner/profile/profile-view.tsx",
            "전화하기",
        ],
    ])(
        "%s — 번호 텍스트를 그리지 않고 PhoneContactLink 버튼을 쓴다",
        (_n, path, label) => {
            const src = srcWithoutTelHref(path);
            expect(src).not.toContain("{COMPANY.tel}");
            expect(src).toContain("<PhoneContactLink");
            expect(src).toContain(label);
            expect(src).toContain("{COMPANY.hours}");
        },
    );
});

describe("추가결제 독촉 메일 — 번호·시간은 COMPANY 에서 읽는다", () => {
    it("하드코딩 번호·시간이 없고 COMPANY.tel · COMPANY.hours 를 쓴다", () => {
        const src = readFileSync(
            resolve(process.cwd(), "lib/payments/extension.ts"),
            "utf8",
        );
        expect(src).not.toContain(COMPANY.tel);
        expect(src).not.toMatch(/\d{2,3}-\d{3,4}-\d{4}/);
        expect(src).toContain("${COMPANY.tel}");
        expect(src).toContain("${COMPANY.hours}");
    });
});

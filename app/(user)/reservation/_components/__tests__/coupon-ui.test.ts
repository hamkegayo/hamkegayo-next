import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OpeningCoupon } from "@/lib/opening-coupon";
import type { OpeningCouponOffer } from "@/lib/opening-coupon-offer";

vi.mock("next/navigation", () => ({
    usePathname: () => "/mypage",
    useRouter: () => ({ push: () => {} }),
}));
vi.mock("@/hooks/use-logout", () => ({
    useLogout: () => ({ logout: () => {}, pending: false }),
}));

import { CouponNoticeBand } from "../step-service-select";
import { CouponEstimateRow } from "../step-review";
import { PaymentCouponSection } from "../step-payment";
import {
    CouponMenuBadge,
    MypageSidebar,
} from "@/app/(user)/mypage/_components/mypage-sidebar";

const AVAILABLE: OpeningCoupon = {
    state: "AVAILABLE",
    discount: 20000,
    discounts: { basic: 20000, plus: 25000 },
};
const HIDDEN: OpeningCoupon = { state: "HIDDEN", discount: 0 };
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
    renderToStaticMarkup(el);

describe("3번 서비스 선택 쿠폰 안내 띠", () => {
    it("AVAILABLE 이면 보유 안내(혜택 확보 아님)를 보여주고 금액은 서버 값이다", () => {
        const both = html(
            createElement(CouponNoticeBand, { status: AVAILABLE, plan: "" }),
        );
        expect(both).toContain("베이직 20,000원");
        expect(both).toContain("플러스 25,000원");
        expect(both).toContain("결제 단계에서 적용 · 선착순");
        expect(both).toContain("혜택이 확보되지는");
        const plus = html(
            createElement(CouponNoticeBand, {
                status: AVAILABLE,
                plan: "plus",
            }),
        );
        expect(plus).toContain("25,000원");
    });
    it("대상이 아니면 보이지 않는다", () => {
        for (const state of ["HIDDEN", "USED", "EXHAUSTED", "HELD"] as const) {
            expect(
                html(
                    createElement(CouponNoticeBand, {
                        status: { ...AVAILABLE, state },
                        plan: "basic",
                    }),
                ),
            ).toBe("");
        }
    });
});

describe("4번 확인 단계 쿠폰 적용 시 예상", () => {
    it("AVAILABLE 이면 별도 줄과 비확정 문구를 보여준다", () => {
        const out = html(
            createElement(CouponEstimateRow, {
                status: AVAILABLE,
                plan: "basic",
                amount: 40000,
            }),
        );
        expect(out).toContain("쿠폰 적용 시 예상");
        expect(out).toContain("20,000원");
        expect(out).toContain("확정이 아닙니다");
        expect(out).toContain("결제 완료·예약 확정 선착순");
    });
    it("0원 미만으로 내려가지 않는다", () => {
        const out = html(
            createElement(CouponEstimateRow, {
                status: AVAILABLE,
                plan: "plus",
                amount: 10000,
            }),
        );
        expect(out).toContain(">0원<");
    });
    it("비대상이거나 금액 계산 전이면 보이지 않는다", () => {
        expect(
            html(
                createElement(CouponEstimateRow, {
                    status: HIDDEN,
                    plan: "basic",
                    amount: 40000,
                }),
            ),
        ).toBe("");
        expect(
            html(
                createElement(CouponEstimateRow, {
                    status: AVAILABLE,
                    plan: "basic",
                    amount: null,
                }),
            ),
        ).toBe("");
    });
});

const ELIGIBLE: OpeningCouponOffer = {
    eligible: true,
    discount: 20000,
    state: "AVAILABLE",
};
const section = (props: {
    loaded?: boolean;
    offer: OpeningCouponOffer;
    checked?: boolean;
}) =>
    html(
        createElement(PaymentCouponSection, {
            loaded: props.loaded ?? true,
            offer: props.offer,
            checked: props.checked ?? true,
            onCheckedChange: () => {},
            gross: 40000,
        }),
    );

describe("7번 결제 단계 쿠폰 영역", () => {
    it("적용 가능이면 체크 상태, 적용 전후 금액, 복원 불가 안내를 보여준다", () => {
        const out = section({ offer: ELIGIBLE, checked: true });
        expect(out).toContain('aria-checked="true"');
        expect(out).toContain("이번 예약에 사용");
        expect(out).toContain("고객 취소·노쇼 시 혜택이 복원되지 않습니다");
        expect(out).toContain("적용 전 금액");
        expect(out).toContain("40,000원");
        expect(out).toContain("적용 후 결제 금액");
        expect(out).toContain("20,000원");
    });
    it("체크를 해제하면 해제 상태로 그려진다", () => {
        expect(section({ offer: ELIGIBLE, checked: false })).toContain(
            'aria-checked="false"',
        );
    });
    it("미대상자(HIDDEN)에게 안내와 쿠폰함·이벤트 링크를 보여준다", () => {
        const out = section({
            offer: { eligible: false, discount: 0, state: "HIDDEN" },
        });
        expect(out).toContain("사용 가능한 오픈 이벤트 쿠폰이 없습니다.");
        expect(out).toContain('href="/mypage/coupons"');
        expect(out).toContain('href="/event/opening"');
    });
    it("조회 중에는 아무것도 그리지 않고, 행사 종료면 HIDDEN 안내를 숨긴다", () => {
        expect(
            section({
                loaded: false,
                offer: { eligible: false, discount: 0, state: "HIDDEN" },
            }),
        ).toBe("");
        expect(
            section({
                offer: {
                    eligible: false,
                    discount: 0,
                    state: "HIDDEN",
                    ended: true,
                },
            }),
        ).toBe("");
    });
    it("기존 상태 안내(CLOSED 등)는 유지되고 이벤트 링크는 붙지 않는다", () => {
        const out = section({
            offer: { eligible: false, discount: 20000, state: "CLOSED" },
        });
        expect(out).toContain("이벤트가 종료되었습니다.");
        expect(out).toContain('href="/mypage/coupons"');
        expect(out).not.toContain("/event/opening");
    });
});

describe("마이페이지 쿠폰함 배지", () => {
    it("AVAILABLE 일 때만 1 을 보여준다", () => {
        const on = html(createElement(CouponMenuBadge, { state: "AVAILABLE" }));
        expect(on).toContain("1");
        expect(on).toContain('aria-label="사용 가능한 쿠폰 1개"');
        expect(html(createElement(CouponMenuBadge, { state: "HIDDEN" }))).toBe(
            "",
        );
        expect(html(createElement(CouponMenuBadge, { state: "USED" }))).toBe(
            "",
        );
    });

    it("사이드바 메뉴는 가로 스크롤(overflow-x-auto) 없이 줄바꿈(flex-wrap)으로 배치한다", () => {
        const sidebar = html(createElement(MypageSidebar));
        expect(sidebar).not.toContain("overflow-x-auto");
        expect(sidebar).toContain("flex-wrap");
    });
});

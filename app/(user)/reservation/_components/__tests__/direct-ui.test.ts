import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COMPANY } from "@/lib/legal/company";
import { DIRECT_COMPLETE_PARAGRAPHS } from "@/lib/direct-flow-copy";
import { DirectCompleteView } from "../direct-complete-view";
import { StepBand } from "../step-band";
import { UrgentCallNoticeView } from "../urgent-call-notice";
import { DirectReservationPanel } from "@/app/(user)/mypage/reservations/[id]/direct-reservation-panel";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
    renderToStaticMarkup(el);

/** href="tel:..." 속성을 제외한 화면 노출 텍스트에 전화번호 숫자가 없는지 확인한다. */
function visibleMarkup(markup: string) {
    return markup.replaceAll(`tel:${COMPANY.tel}`, "tel:REDACTED");
}

describe("StepBand — 진행 단계 번호 및 진행 점", () => {
    it("기본 8단계(legacy_auto)에서는 점 8개를 그린다", () => {
        const m = html(
            createElement(StepBand, {
                index: 7,
                title: "결제를 진행해주세요.",
                subtitles: ["안내"],
            }),
        );
        expect(m).toContain("7.");
        expect(m.match(/h-2 rounded-full/g)).toHaveLength(8);
    });
    it("신규 6단계(admin_direct)에서는 점 6개를 그린다", () => {
        const m = html(
            createElement(StepBand, {
                index: 5,
                totalSteps: 6,
                title: "결제를 진행해주세요.",
                subtitles: ["안내"],
            }),
        );
        expect(m).toContain("5.");
        expect(m.match(/h-2 rounded-full/g)).toHaveLength(6);
    });
});

describe("DirectCompleteView — 결제 완료 화면", () => {
    const markup = html(
        createElement(DirectCompleteView, {
            reservationNo: "R20261201-1234",
            statusHref: "/mypage/reservations/abc",
            planLabel: "Basic",
            visitLabel: "2026. 12. 10 (목) 10:00",
            useDate: "2026-12-10",
            startTime: "10:00",
            hospital: "원주세브란스",
            userName: "홍길동",
        }),
    );

    it("6단계 번호와 6개 진행 점을 표시한다", () => {
        expect(markup).toContain("6.");
        expect(markup.match(/h-2 rounded-full/g)).toHaveLength(6);
    });
    it("안내문 원문 4문단을 그대로 표시한다", () => {
        expect(DIRECT_COMPLETE_PARAGRAPHS).toEqual([
            "예약 신청 및 결제가 완료되었습니다.",
            "현재 동행 파트너를 확인하고 있으며, 24시간 이내에 예약 진행 결과를 안내드리겠습니다.",
            "파트너 배정이 완료되면 예약이 최종 확정되며, 배정이 어려운 경우 결제하신 금액은 전액 환불됩니다.",
            "급한 예약이나 문의가 있으신 경우 고객센터로 전화해 주세요.",
        ]);
        for (const p of DIRECT_COMPLETE_PARAGRAPHS) expect(markup).toContain(p);
    });
    it("3단계 진행 안내와 안심 문구를 표시한다", () => {
        expect(markup).toContain("① 접수·결제 완료(현재)");
        expect(markup).toContain("② 24시간 이내 파트너 확인");
        expect(markup).toContain("③ 담당 파트너 확정 문자 안내");
        expect(markup).toContain(
            "이 화면을 닫으셔도 예약 접수와 파트너 배정은 정상적으로 진행됩니다.",
        );
    });
    it("예약번호를 표시한다", () => {
        expect(markup).toContain("R20261201-1234");
    });
    it("고객센터 전화 링크는 tel: 이며 버튼 텍스트에 전화번호를 노출하지 않는다", () => {
        expect(markup).toContain(`href="tel:${COMPANY.tel}"`);
        expect(markup).toContain("고객센터 전화하기");
        expect(visibleMarkup(markup)).not.toContain(COMPANY.tel);
    });
    it("결제 직후 예약 확정으로 표시하지 않는다", () => {
        expect(markup).not.toContain("예약이 확정되었습니다");
        expect(markup).not.toContain("예약 확정");
        expect(markup).toContain("결제 완료 · 파트너 배정 대기");
    });
    it("완료 화면에서는 결제 전 문구(온라인 결제 안내)를 노출하지 않는다", () => {
        expect(markup).not.toContain(
            "온라인 결제는 그대로 진행하실 수 있습니다",
        );
    });
});

describe("UrgentCallNoticeView", () => {
    it("결제 전 급한 예약이면 강조하고, 온라인 결제를 막지 않는다고 알린다", () => {
        const m = html(createElement(UrgentCallNoticeView, { urgent: true }));
        expect(m).toContain('data-urgent="true"');
        expect(m).toContain("24시간 미만");
        expect(m).toContain("온라인 결제는 그대로 진행하실 수 있습니다");
        expect(m).toContain(`href="tel:${COMPANY.tel}"`);
        expect(m).toContain("고객센터 전화하기");
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });
    it("완료 화면 급한 예약은 결제 완료 후 문맥으로 안내한다", () => {
        const m = html(
            createElement(UrgentCallNoticeView, {
                urgent: true,
                context: "complete",
                hideCallButtonWhenNormal: true,
            }),
        );
        expect(m).toContain('data-urgent="true"');
        expect(m).toContain("빠른 파트너 배정이 필요하시면");
        expect(m).not.toContain("온라인 결제는 그대로 진행하실 수 있습니다");
        expect(m).toContain("고객센터 전화하기");
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });
    it("급하지 않으면 기본 안내와 버튼 CTA를 보여준다", () => {
        const m = html(createElement(UrgentCallNoticeView, { urgent: false }));
        expect(m).toContain('data-urgent="false"');
        expect(m).not.toContain("24시간 미만");
        expect(m).toContain(`href="tel:${COMPANY.tel}"`);
        expect(m).toContain("고객센터 전화하기");
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });
    it("완료 화면에서 급하지 않으면 상단 버튼과 중복되는 전화 버튼을 숨길 수 있다", () => {
        const m = html(
            createElement(UrgentCallNoticeView, {
                urgent: false,
                context: "complete",
                hideCallButtonWhenNormal: true,
            }),
        );
        expect(m).toContain('data-urgent="false"');
        expect(m).not.toContain("고객센터 전화하기");
    });
});

describe("DirectReservationPanel — 예약 조회·배정 전 취소", () => {
    const props = {
        code: "R1",
        hospital: "병원",
        dateLabel: "2026.12.10 (목)",
        timeLabel: "10:00",
        plan: "Basic",
        refundReason: null,
        urgent: false,
    } as const;

    it("결제 완료·배정 대기: 전액 환불 안내와 취소 버튼", () => {
        const m = html(
            createElement(DirectReservationPanel, {
                ...props,
                phase: "WAITING",
            }),
        );
        expect(m).toContain("결제 완료 · 파트너 배정 대기");
        expect(m).toContain("전액 환불");
        expect(m).toContain("예약 취소(전액 환불)");
        expect(m).toContain("고객센터 전화하기");
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });
    it("결제 전: 결제 이어하기 링크", () => {
        const m = html(
            createElement(DirectReservationPanel, {
                ...props,
                phase: "UNPAID",
                resumeHref: "/reservation?pay=resume&rid=abc",
            }),
        );
        expect(m).toContain("결제 이어하기");
        expect(m).toContain("결제 전 예약은 취소해도 요금이 청구되지 않습니다");
    });
    it("PG 취소 실패: 환불 완료로 표시하지 않고 취소 버튼도 없고 전화번호를 노출하지 않는다", () => {
        const m = html(
            createElement(DirectReservationPanel, {
                ...props,
                phase: "REFUND_DELAYED",
                refundReason: "CUSTOMER_CANCEL",
            }),
        );
        expect(m).toContain("환불 처리 지연");
        expect(m).toContain("환불이 완료된 것이 아니");
        expect(m).not.toContain("환불 완료");
        expect(m).not.toContain("예약 취소(전액 환불)");
        expect(m).toContain(`href="tel:${COMPANY.tel}"`);
        expect(m).toContain("고객센터 전화하기");
        expect(visibleMarkup(m)).not.toContain(COMPANY.tel);
    });
    it("매칭 실패 환불 진행·완료를 구분해 표시한다", () => {
        const going = html(
            createElement(DirectReservationPanel, {
                ...props,
                phase: "REFUND_IN_PROGRESS",
                refundReason: "MATCH_FAILED",
            }),
        );
        expect(going).toContain("환불 진행 중");
        expect(going).not.toContain("환불 완료");
        expect(visibleMarkup(going)).not.toContain(COMPANY.tel);
        const done = html(
            createElement(DirectReservationPanel, {
                ...props,
                phase: "REFUNDED",
                refundReason: "MATCH_FAILED",
            }),
        );
        expect(done).toContain("환불 완료");
        expect(done).toContain("배정이 어려워");
    });
    it("급한 예약이면 상세에서도 완료 후 문맥으로 전화 상담을 강조한다", () => {
        const m = html(
            createElement(DirectReservationPanel, {
                ...props,
                phase: "WAITING",
                urgent: true,
            }),
        );
        expect(m).toContain('data-urgent="true"');
        expect(m).toContain("빠른 파트너 배정이 필요하시면");
        expect(m).not.toContain("온라인 결제는 그대로 진행하실 수 있습니다");
    });
});

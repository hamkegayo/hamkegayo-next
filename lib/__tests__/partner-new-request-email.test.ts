import { describe, expect, it } from "vitest";

import { buildNewRequestEmail } from "@/lib/partner-new-request-email";

// 새 요청 메일에 예약 내용이 실리지 않는다 (#269 리뷰 — Resend 위탁 항목은 이메일 주소·인증 정보뿐)
describe("파트너 새 요청 메일", () => {
    it("수락 대기 목록 링크만 담고 예약별 주소를 담지 않는다", () => {
        const { html, subject } = buildNewRequestEmail("https://example.test/");
        expect(subject).toBe("[함께가요] 새 동행 요청이 도착했어요");
        expect(html).toContain('href="https://example.test/partner/requests"');
        expect(html).not.toMatch(/\/partner\/requests\/[0-9a-f-]{8,}/);
    });

    it("일시·상품·병원 같은 예약 내용이 없다", () => {
        const { html } = buildNewRequestEmail("https://example.test");
        expect(html).not.toMatch(/\d{2}:\d{2}|Basic|Plus|병원\s*:|구\b/);
    });
});

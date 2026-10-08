import { describe, expect, it } from "vitest";

import { adminRedirect } from "../middleware";

// #287 — 관리자 세션의 미들웨어 이동 규칙.
describe("2단계 인증 전(aal1) 관리자", () => {
    it.each(["/admin/login", "/api/admin/accounts/activate"])(
        "%s 는 통과한다 — 초기 비밀번호 변경이 인증기 등록보다 먼저다",
        (pathname) => {
            expect(adminRedirect(pathname, false)).toBeNull();
        },
    );
    it.each([
        "/admin",
        "/admin/accounts",
        "/api/admin/accounts/admin",
        "/api/admin/refunds",
        "/api/admin/accounts/activate/extra",
        "/mypage",
    ])("%s 는 관리자 로그인으로 보낸다", (pathname) => {
        expect(adminRedirect(pathname, false)).toEqual({ to: "/admin/login" });
    });
});

describe("2단계 인증을 마친(aal2) 관리자", () => {
    it.each([
        "/admin",
        "/admin/refunds",
        "/api/admin/refunds",
        "/api/admin/accounts/admin",
        "/api/admin/settlements/transfer-file",
    ])("%s 는 통과한다 — 관리자 화면이 호출하는 API 포함", (pathname) => {
        expect(adminRedirect(pathname, true)).toBeNull();
    });
    it("관리자 로그인은 관리자 홈으로 보낸다", () => {
        expect(adminRedirect("/admin/login", true)).toEqual({ to: "/admin" });
    });
    it.each(["/", "/reservation", "/api/payments/prepare", "/administrator"])(
        "%s 는 관리자 영역 밖이라 차단한다",
        (pathname) => {
            expect(adminRedirect(pathname, true)).toEqual({
                to: "/admin",
                search: "?blocked=user",
            });
        },
    );
});

import { describe, expect, it } from "vitest";

import {
    ADMIN_WITHDRAW_ERROR_MESSAGE,
    ADMIN_WITHDRAW_FALLBACK_MESSAGE,
    adminWithdrawErrorMessage,
    classifyMemberLookupQuery,
    normalizeWithdrawalReason,
    WITHDRAW_BLOCKER_MESSAGE,
} from "../admin-withdrawal";

describe("classifyMemberLookupQuery — 정확 일치 형식만 (#293)", () => {
    it("회원 UUID 는 소문자로 정규화한다", () => {
        expect(
            classifyMemberLookupQuery(
                "  00000293-0000-4000-8000-0000000001AB ",
            ),
        ).toEqual({
            kind: "uuid",
            value: "00000293-0000-4000-8000-0000000001ab",
        });
    });

    it("이메일은 공백을 지우고 소문자로 정규화한다", () => {
        expect(classifyMemberLookupQuery(" WD-User@Example.COM ")).toEqual({
            kind: "email",
            value: "wd-user@example.com",
        });
    });

    it("휴대전화번호는 하이픈·공백을 지운 숫자 9-11자리", () => {
        expect(classifyMemberLookupQuery("010-1234-5678")).toEqual({
            kind: "phone",
            value: "01012345678",
        });
        expect(classifyMemberLookupQuery("02 123 4567")).toEqual({
            kind: "phone",
            value: "021234567",
        });
    });

    it.each([
        "",
        "   ",
        "홍길동",
        "wd-user",
        "@example.com",
        "a@b c.com",
        "user@localhost",
        "0101234",
        "010123456789",
        "010-1234-5678 홍길동",
        "00000293-0000-4000-8000",
        `${"a".repeat(195)}@ex.com`,
    ])("부분·이름·형식 오류는 invalid: %j", (q) => {
        expect(classifyMemberLookupQuery(q)).toEqual({ kind: "invalid" });
    });
});

describe("normalizeWithdrawalReason — 5-500자", () => {
    it("앞뒤 공백을 지운 값을 돌려준다", () => {
        expect(normalizeWithdrawalReason("  이메일로 탈퇴 확인  ")).toEqual({
            ok: true,
            reason: "이메일로 탈퇴 확인",
        });
    });

    it("경계값 5자·500자는 통과한다", () => {
        expect(normalizeWithdrawalReason("가".repeat(5)).ok).toBe(true);
        expect(normalizeWithdrawalReason("가".repeat(500)).ok).toBe(true);
    });

    it("공백을 빼고 5자 미만이거나 500자 초과면 거절한다", () => {
        expect(normalizeWithdrawalReason("  확인  ").ok).toBe(false);
        expect(normalizeWithdrawalReason("가".repeat(501)).ok).toBe(false);
        expect(normalizeWithdrawalReason("").ok).toBe(false);
    });
});

describe("오류 메시지 매핑", () => {
    it.each([
        "UNPAID_CHARGE",
        "ACTIVE_RESERVATION",
        "ACTIVE_SERVICE",
        "PENDING_SETTLEMENT",
        "PROFILE_NOT_FOUND",
        "ADMIN_NOT_ALLOWED",
        "ALREADY_WITHDRAWN",
        "SOCIAL_UNLINK_NOT_FOUND",
        "SOCIAL_UNLINK_USER_MISMATCH",
        "invalid_reason",
        "invalid_query",
        "forbidden",
    ])("%s 는 전용 안내로 바뀐다", (code) => {
        const message = adminWithdrawErrorMessage({ message: code });
        expect(message).toBe(ADMIN_WITHDRAW_ERROR_MESSAGE[code]);
        expect(message).not.toBe(ADMIN_WITHDRAW_FALLBACK_MESSAGE);
    });

    it("모르는 오류·빈 오류는 일반 문구", () => {
        expect(adminWithdrawErrorMessage({ message: "connection reset" })).toBe(
            ADMIN_WITHDRAW_FALLBACK_MESSAGE,
        );
        expect(adminWithdrawErrorMessage(null)).toBe(
            ADMIN_WITHDRAW_FALLBACK_MESSAGE,
        );
    });

    it("본인 탈퇴 안내 문구는 기존과 같다 (#72)", () => {
        expect(Object.keys(WITHDRAW_BLOCKER_MESSAGE).sort()).toEqual(
            [
                "ACTIVE_RESERVATION",
                "ACTIVE_SERVICE",
                "PENDING_SETTLEMENT",
                "PROFILE_NOT_FOUND",
                "UNPAID_CHARGE",
            ].sort(),
        );
        expect(WITHDRAW_BLOCKER_MESSAGE.UNPAID_CHARGE).toBe(
            "결제되지 않은 추가 요금이 있어 탈퇴할 수 없습니다. 마이페이지에서 결제를 완료한 뒤 다시 시도해 주세요.",
        );
    });
});

import { describe, expect, it } from "vitest";

import { missingNicepayKeys } from "@/lib/payments/nicepay";

// 키 없이 결제 준비가 성공(200)으로 끝나 결제창에서야 오류가 나던 문제(#259).
describe("NICEPAY 키 누락 확인", () => {
    it("두 키가 모두 있으면 빈 목록", () => {
        expect(
            missingNicepayKeys({
                NEXT_PUBLIC_NICEPAY_CLIENT_KEY: "S2_client",
                NICEPAY_SECRET_KEY: "secret",
            }),
        ).toEqual([]);
    });

    it("없거나 공백뿐인 키의 이름만 돌려준다", () => {
        expect(
            missingNicepayKeys({
                NEXT_PUBLIC_NICEPAY_CLIENT_KEY: "   ",
                NICEPAY_SECRET_KEY: "secret",
            }),
        ).toEqual(["NEXT_PUBLIC_NICEPAY_CLIENT_KEY"]);
        expect(missingNicepayKeys({})).toEqual([
            "NEXT_PUBLIC_NICEPAY_CLIENT_KEY",
            "NICEPAY_SECRET_KEY",
        ]);
    });

    it("값은 돌려주지 않는다", () => {
        const result = missingNicepayKeys({
            NEXT_PUBLIC_NICEPAY_CLIENT_KEY: "S2_client",
            NICEPAY_SECRET_KEY: "",
        });
        expect(result.join()).not.toContain("S2_client");
    });
});

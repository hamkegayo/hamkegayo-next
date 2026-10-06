import { describe, expect, it } from "vitest";

import { resolveNicepayHosts } from "@/lib/payments/nicepay";

// E2E 모의 PG 주소 재지정(#214)이 운영 결제를 다른 곳으로 보내지 못하는지 확인한다.
describe("NICEPAY API 주소", () => {
    it("키 접두사로 샌드박스·운영 호스트를 고른다", () => {
        expect(resolveNicepayHosts("S2_abc").apiBase).toBe(
            "https://sandbox-api.nicepay.co.kr",
        );
        expect(resolveNicepayHosts("R2_abc").apiBase).toBe(
            "https://api.nicepay.co.kr",
        );
    });

    it("샌드박스 키 + 루프백 주소일 때만 모의 서버로 보낸다", () => {
        expect(
            resolveNicepayHosts("S2_e2e", "http://127.0.0.1:4010/").apiBase,
        ).toBe("http://127.0.0.1:4010");
        expect(
            resolveNicepayHosts("S2_e2e", "http://localhost:4010").apiBase,
        ).toBe("http://localhost:4010");
    });

    it.each([
        ["운영 키", "R2_live", "http://127.0.0.1:4010"],
        ["외부 주소", "S2_e2e", "https://evil.example.com"],
        ["http 가 아닌 루프백", "S2_e2e", "ftp://127.0.0.1"],
        ["잘못된 값", "S2_e2e", "not a url"],
    ])("%s 는 무시한다", (_, key, override) => {
        expect(resolveNicepayHosts(key, override).apiBase).toMatch(
            /^https:\/\/(sandbox-)?api\.nicepay\.co\.kr$/,
        );
    });
});

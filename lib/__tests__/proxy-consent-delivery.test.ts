import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
    headers: vi.fn(async () => new Headers({ host: "app.test:3000" })),
}));

import {
    deliverConsentLink,
    getConsentDelivery,
    manualLinkDelivery,
    type ConsentDelivery,
} from "../proxy-consent-delivery.server";
import {
    buildConsentLink,
    generateConsentToken,
    hashConsentToken,
    isWellFormedConsentToken,
} from "../proxy-consent-token.server";
import {
    isSelfRelation,
    phoneLast4,
    resolveConsentMode,
} from "../proxy-consent";

const req = {
    reservationId: "res-1",
    patientPhone: "010-1234-5678",
    link: "https://example.test/consent/SECRET-TOKEN",
    expiresAt: "2099-01-01T00:00:00.000Z",
};

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("본인 동의 링크 전달 어댑터 (제10조 ②)", () => {
    it("발송 수단이 설정되지 않으면 MANUAL_LINK 로 돌아간다", () => {
        expect(getConsentDelivery(undefined)).toBe(manualLinkDelivery);
        expect(getConsentDelivery("sms")).toBe(manualLinkDelivery);
    });

    it("MANUAL_LINK 는 발송하지 않고 보호자 전달을 요구한다", async () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => {});
        const res = await deliverConsentLink(req);
        expect(res).toEqual({ channel: "MANUAL_LINK", delivered: false });
        // 링크·연락처는 로그에 남기지 않는다
        const logged = JSON.stringify(info.mock.calls);
        expect(logged).not.toContain("SECRET-TOKEN");
        expect(logged).not.toContain("5678");
    });

    it("발송 어댑터가 실패하면 보호자 수동 전달로 되돌리고 링크·연락처를 로그에 남기지 않는다", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const failing: ConsentDelivery = {
            channel: "SMS",
            send: async () => {
                throw new Error("provider down");
            },
        };
        const res = await deliverConsentLink(req, failing);
        expect(res).toEqual({ channel: "MANUAL_LINK", delivered: false });
        const logged = JSON.stringify(error.mock.calls);
        expect(logged).not.toContain("SECRET-TOKEN");
        expect(logged).not.toContain("5678");
    });

    it("발송 어댑터가 성공하면 그 결과를 그대로 돌려준다", async () => {
        vi.spyOn(console, "info").mockImplementation(() => {});
        const ok: ConsentDelivery = {
            channel: "ALIMTALK",
            send: async () => ({ channel: "ALIMTALK", delivered: true }),
        };
        expect(await deliverConsentLink(req, ok)).toEqual({
            channel: "ALIMTALK",
            delivered: true,
        });
    });
});

describe("본인 동의 토큰", () => {
    it("32바이트 무작위 토큰을 만들고 SHA-256 해시를 돌려준다", () => {
        const a = generateConsentToken();
        const b = generateConsentToken();
        expect(isWellFormedConsentToken(a.token)).toBe(true);
        expect(a.token).not.toBe(b.token);
        expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(a.hash).toBe(hashConsentToken(a.token));
        expect(a.hash).not.toContain(a.token);
    });

    it("형식이 다른 토큰은 거부한다", () => {
        expect(isWellFormedConsentToken("short")).toBe(false);
        expect(isWellFormedConsentToken("a".repeat(44))).toBe(false);
        expect(isWellFormedConsentToken("!".repeat(43))).toBe(false);
    });

    it("링크는 설정된 사이트 주소, 없으면 요청 호스트로 만든다", async () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://site.test/";
        expect(await buildConsentLink("T")).toBe("https://site.test/consent/T");
        delete process.env.NEXT_PUBLIC_SITE_URL;
        expect(await buildConsentLink("T")).toBe(
            "http://app.test:3000/consent/T",
        );
    });
});

describe("동의 주체 판정", () => {
    it("관계가 본인이면 선택값과 무관하게 SELF", () => {
        expect(isSelfRelation("본인")).toBe(true);
        expect(isSelfRelation("자녀")).toBe(false);
        expect(
            resolveConsentMode({
                relation: "본인",
                consentMode: "USER_DIRECT",
            }),
        ).toBe("SELF");
    });

    it("대리 관계는 선택한 방식, 없으면 null", () => {
        expect(
            resolveConsentMode({
                relation: "자녀",
                consentMode: "USER_DIRECT",
            }),
        ).toBe("USER_DIRECT");
        expect(
            resolveConsentMode({
                relation: "자녀",
                consentMode: "GUARDIAN_PROXY",
            }),
        ).toBe("GUARDIAN_PROXY");
        expect(
            resolveConsentMode({ relation: "자녀", consentMode: "" }),
        ).toBeNull();
        expect(resolveConsentMode({ relation: "자녀" })).toBeNull();
    });

    it("연락처 끝 4자리", () => {
        expect(phoneLast4("010-1234-5678")).toBe("5678");
    });
});

import {
    createElement,
    type ComponentProps,
    type FunctionComponent,
    type ReactElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "qrcode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ trackContact: vi.fn() }));

import { trackContact } from "@/lib/analytics";
import { COMPANY } from "@/lib/legal/company";
import { ContactLink } from "@/app/(user)/_components/home/contact-link";
import { PhoneContactLink } from "../phone-contact-link";
import { PhoneQrCode, qrPathData } from "../phone-qr-code";
import {
    closePhoneContactModal,
    getPhoneContactModal,
} from "../phone-contact-store";

/** children 을 createElement 세 번째 인자로 넘기기 위한 타입 별칭 (react/no-children-prop) */
const Contact = ContactLink as unknown as FunctionComponent<
    Omit<ComponentProps<typeof ContactLink>, "children">
>;

type AnchorProps = {
    href: string;
    onClick: (e: FakeClick) => void;
    children?: unknown;
};

type FakeClick = {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    defaultPrevented: boolean;
    preventDefault: () => void;
};

function click(overrides: Partial<FakeClick> = {}): FakeClick {
    const e: FakeClick = {
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
        preventDefault: vi.fn(() => {
            e.defaultPrevented = true;
        }),
        ...overrides,
    };
    return e;
}

/** 훅이 없는 함수 컴포넌트를 끝까지 풀어 실제 `<a>` 요소를 얻는다 */
function resolveAnchor(el: ReactElement): ReactElement<AnchorProps> {
    let cur = el as ReactElement<AnchorProps>;
    while (typeof cur.type === "function") {
        cur = (cur.type as (p: unknown) => ReactElement<AnchorProps>)(
            cur.props,
        );
    }
    expect(cur.type).toBe("a");
    return cur;
}

function stubPointer(coarse: boolean) {
    vi.stubGlobal("window", {
        matchMedia: (q: string) => ({
            matches: q === "(pointer: coarse)" ? coarse : !coarse,
        }),
    });
}

beforeEach(() => {
    closePhoneContactModal();
    vi.mocked(trackContact).mockClear();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("PhoneQrCode — 로컬 SVG QR", () => {
    const markup = renderToStaticMarkup(createElement(PhoneQrCode));

    it("svg 하나와 path 하나로 그린다", () => {
        expect(markup.startsWith("<svg")).toBe(true);
        expect(markup.match(/<path /g)).toHaveLength(1);
        expect(markup).toContain('role="img"');
        expect(markup).toContain(
            `aria-label="고객센터 전화번호 ${COMPANY.tel} QR 코드"`,
        );
        expect(markup).toContain('shape-rendering="crispEdges"');
    });
    it("외부 URL·이미지를 참조하지 않는다", () => {
        expect(markup).not.toMatch(/https?:\/\//);
        expect(markup).not.toContain("<image");
        expect(markup).not.toContain("href");
    });
    it("tel: 번호를 인코딩하고 사방 4모듈 여백을 둔다", () => {
        const n = QRCode.create(`tel:${COMPANY.tel}`, {
            errorCorrectionLevel: "M",
        }).modules.size;
        const { size, d } = qrPathData(`tel:${COMPANY.tel}`);
        expect(size).toBe(n + 8);
        expect(markup).toContain(`viewBox="0 0 ${size} ${size}"`);
        // 좌상단 파인더 패턴의 첫 모듈은 (4,4) 에서 시작한다
        expect(d.startsWith("M4 4h1v1h-1z")).toBe(true);
    });
});

describe("PhoneContactLink — 기기별 클릭 동작", () => {
    const anchor = () =>
        resolveAnchor(createElement(PhoneContactLink, {}, "고객센터 전화하기"));

    it("기본 href 는 tel:COMPANY.tel 이고 번호 텍스트를 그리지 않는다", () => {
        const m = renderToStaticMarkup(
            createElement(PhoneContactLink, {}, "고객센터 전화하기"),
        );
        expect(m).toBe(`<a href="tel:${COMPANY.tel}">고객센터 전화하기</a>`);
    });
    it("PC(pointer: fine): 기본 동작을 막고 모달을 연다", () => {
        stubPointer(false);
        const e = click();
        anchor().props.onClick(e);
        expect(e.preventDefault).toHaveBeenCalledTimes(1);
        expect(getPhoneContactModal().open).toBe(true);
        expect(getPhoneContactModal().openedAt).not.toBeNull();
    });
    it("모바일(pointer: coarse): tel: 기본 동작을 두고 모달을 열지 않는다", () => {
        stubPointer(true);
        const e = click();
        anchor().props.onClick(e);
        expect(e.preventDefault).not.toHaveBeenCalled();
        expect(getPhoneContactModal().open).toBe(false);
    });
    it.each([
        ["가운데 버튼", { button: 1 }],
        ["Ctrl", { ctrlKey: true }],
        ["Meta", { metaKey: true }],
        ["Shift", { shiftKey: true }],
        ["Alt", { altKey: true }],
    ])("PC 에서도 %s 클릭은 가로채지 않는다", (_label, o) => {
        stubPointer(false);
        const e = click(o);
        anchor().props.onClick(e);
        expect(e.preventDefault).not.toHaveBeenCalled();
        expect(getPhoneContactModal().open).toBe(false);
    });
});

describe("ContactLink — 집계는 PC·모바일 모두 1회", () => {
    const tel = () =>
        resolveAnchor(
            createElement(
                Contact,
                {
                    href: `tel:${COMPANY.tel}`,
                    method: "phone",
                },
                "전화 상담",
            ),
        );

    it("PC: trackContact('phone') 1회 + preventDefault + 모달 오픈", () => {
        stubPointer(false);
        const e = click();
        tel().props.onClick(e);
        expect(trackContact).toHaveBeenCalledTimes(1);
        expect(trackContact).toHaveBeenCalledWith("phone");
        expect(e.preventDefault).toHaveBeenCalledTimes(1);
        expect(getPhoneContactModal().open).toBe(true);
    });
    it("모바일: trackContact('phone') 1회, 모달 미오픈", () => {
        stubPointer(true);
        const e = click();
        tel().props.onClick(e);
        expect(trackContact).toHaveBeenCalledTimes(1);
        expect(trackContact).toHaveBeenCalledWith("phone");
        expect(e.preventDefault).not.toHaveBeenCalled();
        expect(getPhoneContactModal().open).toBe(false);
    });
    it("tel: 가 아닌 링크(카카오톡)는 기존 동작 그대로", () => {
        stubPointer(false);
        const a = resolveAnchor(
            createElement(
                Contact,
                {
                    href: COMPANY.kakaoUrl,
                    method: "support",
                    external: true,
                },
                "카카오톡",
            ),
        );
        expect(a.props).toMatchObject({
            href: COMPANY.kakaoUrl,
            target: "_blank",
            rel: "noreferrer noopener",
        });
        const e = click();
        a.props.onClick(e);
        expect(trackContact).toHaveBeenCalledWith("support");
        expect(e.preventDefault).not.toHaveBeenCalled();
        expect(getPhoneContactModal().open).toBe(false);
    });
    it("버튼 마크업에 전화번호 텍스트가 섞이지 않는다", () => {
        const m = renderToStaticMarkup(
            createElement(
                Contact,
                {
                    href: `tel:${COMPANY.tel}`,
                    method: "phone",
                },
                "전화 상담",
            ),
        );
        expect(m.replaceAll(`tel:${COMPANY.tel}`, "")).not.toContain(
            COMPANY.tel,
        );
    });
});

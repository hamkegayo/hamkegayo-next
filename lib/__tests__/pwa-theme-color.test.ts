import { describe, expect, it, vi } from "vitest";

// layout.tsx 는 폰트·CSS·클라이언트 컴포넌트를 끌어온다 — viewport 값만 필요하므로 무거운 의존성은 막는다.
vi.mock("next/font/local", () => ({
    default: () => ({ variable: "", className: "" }),
}));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/analytics/analytics-scripts", () => ({
    AnalyticsScripts: () => null,
}));
vi.mock("@/components/analytics/page-view-tracker", () => ({
    PageViewTracker: () => null,
}));
vi.mock("@/components/analytics/consent-banner", () => ({
    ConsentBanner: () => null,
}));
vi.mock("@/components/pwa/service-worker-register", () => ({
    ServiceWorkerRegister: () => null,
}));
vi.mock("@/components/pwa/install-tracker", () => ({
    InstallTracker: () => null,
}));
vi.mock("@/components/pwa/install-entry", () => ({
    InstallSheetHost: () => null,
}));
vi.mock("@/components/contact/phone-contact-modal", () => ({
    PhoneContactModalHost: () => null,
}));
vi.mock("@/components/pwa/pwa-debug", () => ({ PwaDebug: () => null }));

import { viewport } from "@/app/layout";
import manifest from "@/app/manifest";

describe("PWA 상태바 색 (#315)", () => {
    it("viewport.themeColor 와 manifest.theme_color 는 페이지 배경 #ffffff 로 같다", () => {
        expect(viewport.themeColor).toBe("#ffffff");
        expect(manifest().theme_color).toBe("#ffffff");
        expect(manifest().theme_color).toBe(viewport.themeColor);
    });
});

import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { PWA_THEME_COLOR } from "@/lib/pwa/theme";

describe("PWA 상태바 색 (#315)", () => {
    it("manifest.theme_color 는 공유 상수 PWA_THEME_COLOR(#ffffff) 를 사용한다", () => {
        expect(PWA_THEME_COLOR).toBe("#ffffff");
        expect(manifest().theme_color).toBe(PWA_THEME_COLOR);
        expect(manifest().background_color).toBe("#ffffff");
    });
});

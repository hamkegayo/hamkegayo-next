import { afterEach, describe, expect, it, vi } from "vitest";

import {
    isAdminDirect,
    matchingModeOf,
    newReservationMatchingMode,
    parseDirectAssignmentFlag,
} from "@/lib/direct-assignment";

// 신규 예약의 처리 방식 (#300). 기본값은 바로 적용(admin_direct)이며, false 로 명시할 때만 기존 방식으로 되돌린다.
describe("direct assignment flag", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("defaults to the direct-assignment flow when unset or unrecognised", () => {
        expect(parseDirectAssignmentFlag(undefined)).toBe("admin_direct");
        expect(parseDirectAssignmentFlag("")).toBe("admin_direct");
        expect(parseDirectAssignmentFlag("maybe")).toBe("admin_direct");
    });

    it("falls back to legacy only for explicit falsy values", () => {
        for (const v of ["1", "true", "TRUE", " on "])
            expect(parseDirectAssignmentFlag(v)).toBe("admin_direct");
        for (const v of ["0", "false", "off"])
            expect(parseDirectAssignmentFlag(v)).toBe("legacy_auto");
    });

    it("reads the shared NEXT_PUBLIC variable at call time", () => {
        vi.stubEnv("NEXT_PUBLIC_DIRECT_ASSIGNMENT_FLOW", "true");
        expect(newReservationMatchingMode()).toBe("admin_direct");
        vi.stubEnv("NEXT_PUBLIC_DIRECT_ASSIGNMENT_FLOW", "false");
        expect(newReservationMatchingMode()).toBe("legacy_auto");
    });

    it("keeps an existing reservation on its own mode regardless of the flag", () => {
        vi.stubEnv("NEXT_PUBLIC_DIRECT_ASSIGNMENT_FLOW", "true");
        // 컬럼이 없던 시절의 행·legacy 행은 플래그를 켜도 기존 방식이다
        expect(matchingModeOf(undefined)).toBe("legacy_auto");
        expect(matchingModeOf(null)).toBe("legacy_auto");
        expect(isAdminDirect("legacy_auto")).toBe(false);
        vi.stubEnv("NEXT_PUBLIC_DIRECT_ASSIGNMENT_FLOW", "false");
        expect(isAdminDirect("admin_direct")).toBe(true);
    });
});

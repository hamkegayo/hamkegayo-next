import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ACTIVITY_CONSENT_VERSION } from "@/lib/partner-details";

// 화면이 "재동의 필요"를 판단하는 버전과 DB가 v2 동의로 기록·판정하는 버전이 같아야 한다 (#226).
describe("공개 고지 v2 동의 버전", () => {
    it("마이그레이션 87과 같은 값을 쓴다", () => {
        const sql = readFileSync(
            "supabase/migrations/20260708000087_partner_activity_profiles.sql",
            "utf8",
        );
        expect(sql).toContain(
            `consent_version = '${ACTIVITY_CONSENT_VERSION}'`,
        );
        expect(sql).toContain(`then '${ACTIVITY_CONSENT_VERSION}'`);
    });
});

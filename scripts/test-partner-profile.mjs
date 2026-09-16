import {
    isValidPartnerIntro,
    PARTNER_INTRO_MAX_LENGTH,
} from "@/lib/partner-profile.ts";

let passed = 0;
let failed = 0;

function check(name, condition) {
    if (condition) {
        passed += 1;
        console.log(`  ✓ ${name}`);
        return;
    }
    failed += 1;
    console.error(`  ✗ ${name}`);
}

console.log("\n▶ 파트너 기본정보 검증");

check("빈 자기소개를 허용한다", isValidPartnerIntro(""));
check(
    "300자 자기소개를 허용한다",
    isValidPartnerIntro("가".repeat(PARTNER_INTRO_MAX_LENGTH)),
);
check(
    "301자 자기소개를 거절한다",
    !isValidPartnerIntro("가".repeat(PARTNER_INTRO_MAX_LENGTH + 1)),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

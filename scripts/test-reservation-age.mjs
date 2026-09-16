import {
    isAtLeastAgeOnDate,
    MIN_SERVICE_AGE_MESSAGE,
} from "@/lib/service-age.ts";
import { reservationServerSchema } from "@/app/(user)/reservation/_lib/schema.ts";

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

console.log("\n▶ 서비스 이용자 만 19세 검증");

check(
    "19번째 생일 전날은 이용할 수 없다",
    !isAtLeastAgeOnDate("2007-09-16", "2026-09-15"),
);
check(
    "19번째 생일부터 이용할 수 있다",
    isAtLeastAgeOnDate("2007-09-16", "2026-09-16"),
);
check(
    "19번째 생일이 지난 이용자는 이용할 수 있다",
    isAtLeastAgeOnDate("2007-09-16", "2026-10-01"),
);
check(
    "윤년 생일은 비윤년 3월 1일부터 기준을 충족한다",
    !isAtLeastAgeOnDate("2008-02-29", "2027-02-28") &&
        isAtLeastAgeOnDate("2008-02-29", "2027-03-01"),
);
check(
    "잘못된 달력 날짜는 거절한다",
    !isAtLeastAgeOnDate("2007-02-29", "2026-09-16") &&
        !isAtLeastAgeOnDate("2007-09-16", "2026-02-30"),
);

const validReservation = {
    userName: "성인이용자",
    userBirth: "2000-01-01",
    userGender: "female",
    userPhone: "010-1111-2222",
    guardianName: "보호자",
    guardianPhone: "010-3333-4444",
    relation: "가족",
    treatment: "진료",
    purpose: "외래 진료",
    mobilityStatus: "INDEPENDENT",
    cognitiveStatus: "NORMAL",
    notifyTarget: "BOTH",
    shareMedicalInfo: false,
    useDate: "2026-10-01",
    arriveTime: "10시 00분",
    reserveTime: "10시 30분",
    duration: "2시간",
    departAddress: "강원특별자치도 원주시",
    hospitalName: "테스트 병원",
    hospitalAddress: "강원특별자치도 원주시",
    transportTo: "TAXI",
    transportHome: "TAXI",
    endMethod: "INDEPENDENT",
    plan: "basic",
};

check(
    "서버 예약 스키마가 성인 이용자를 허용한다",
    reservationServerSchema.safeParse(validReservation).success,
);

const minorResult = reservationServerSchema.safeParse({
    ...validReservation,
    userBirth: "2010-01-01",
});
check(
    "서버 예약 스키마가 미성년 이용자를 거절하고 구체적인 사유를 반환한다",
    !minorResult.success &&
        minorResult.error.issues.some(
            (issue) =>
                issue.path[0] === "userBirth" &&
                issue.message === MIN_SERVICE_AGE_MESSAGE,
        ),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

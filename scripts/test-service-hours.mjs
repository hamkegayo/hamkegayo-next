import assert from "node:assert/strict";
import { mock } from "node:test";
import {
    isServiceTime,
    isServiceBooking,
    SERVICE_HOURS_LABEL,
} from "@/lib/service-hours";
import {
    TIME_OPTIONS,
    timeOptionsFor,
} from "@/app/(user)/reservation/_lib/options";
import {
    step2Form,
    reservationServerSchema,
} from "@/app/(user)/reservation/_lib/schema";
import { COMPANY } from "@/lib/legal/company";

let passed = 0;
function check(label, condition) {
    assert.ok(condition, label);
    passed += 1;
    console.log(`PASS: ${label}`);
}
mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-04T00:00:00Z").getTime(),
});

check(
    "daily service label",
    SERVICE_HOURS_LABEL === "매일 07:00~19:00 · 주말·공휴일 포함",
);
check("customer support hours kept separate", COMPANY.hours === "06:00~18:00");
check(
    "first and last slot",
    TIME_OPTIONS[0] === "7시 00분" && TIME_OPTIONS.at(-1) === "19시 00분",
);
check(
    "all 25 half-hour slots valid",
    TIME_OPTIONS.length === 25 && TIME_OPTIONS.every(isServiceTime),
);
for (const time of [
    "06:00",
    "06:30",
    "19:30",
    "20:00",
    "24:00",
    "7시 90분",
    "07:15",
    "junk07:00",
    "07:00junk",
    "7",
    "",
]) {
    check(`invalid service time ${JSON.stringify(time)}`, !isServiceTime(time));
}
for (const time of ["07:00", "7시 00분", "18:30", "19:00", "19시 00분"]) {
    check(`valid service time ${time}`, isServiceTime(time));
}
const input = {
    userName: "Test",
    userBirth: "1960-01-01",
    userGender: "female",
    userPhone: "01000000000",
    guardianName: "Test",
    guardianPhone: "01000000000",
    relation: "본인",
    treatment: "Test",
    purpose: "Test",
    mobilityStatus: "스스로 보행 가능",
    cognitiveStatus: "의사소통 원활",
    notifyTarget: "BOTH",
    shareMedicalInfo: false,
    useDate: "2026-10-05",
    arriveTime: "07:00",
    reserveTime: "07:30",
    duration: "2시간",
    departAddress: "Test",
    hospitalName: "Test",
    hospitalAddress: "Test",
    transportTo: "TAXI",
    transportHome: "TAXI",
    endMethod: "INDEPENDENT",
    plan: "basic",
};
check(
    "server accepts opening boundary",
    reservationServerSchema.safeParse(input).success,
);
for (const field of ["arriveTime", "reserveTime"]) {
    for (const time of ["06:30", "19:30", "07:15", "invalid"]) {
        const result = reservationServerSchema.safeParse({
            ...input,
            [field]: time,
        });
        check(
            `server rejects ${field} ${time}`,
            !result.success &&
                result.error.issues.some((issue) => issue.path[0] === field),
        );
    }
}
check(
    "form also rejects out of range",
    !step2Form.safeParse({ ...input, arriveTime: "06:30" }).success,
);
check(
    "earlier appointment still rejected",
    !reservationServerSchema.safeParse({
        ...input,
        arriveTime: "09:00",
        reserveTime: "08:30",
    }).success,
);
check(
    "past date still rejected",
    !reservationServerSchema.safeParse({ ...input, useDate: "2026-10-03" })
        .success,
);
check(
    "today has no slots after closing",
    timeOptionsFor("2026-10-04", new Date("2026-10-04T10:00:00Z")).length === 0,
);
check(
    "future weekday has all slots",
    timeOptionsFor("2026-10-05").length === 25,
);
check(
    "future weekend has all slots",
    timeOptionsFor("2026-10-10").length === 25,
);
for (const [time, duration, valid] of [
    ["17:00", 120, true],
    ["17:30", 120, false],
    ["16:30", 150, true],
    ["15:00", 240, true],
    ["15:30", 240, false],
    ["19:00", 120, false],
    ["07:00", 90, false],
]) {
    check(
        `planned end ${time}/${duration}`,
        isServiceBooking(time, duration) === valid,
    );
}
check(
    "server allows ending at 19",
    reservationServerSchema.safeParse({
        ...input,
        arriveTime: "17:00",
        reserveTime: "17:30",
    }).success,
);
check(
    "server rejects ending after 19",
    !reservationServerSchema.safeParse({
        ...input,
        arriveTime: "17:30",
        reserveTime: "18:00",
    }).success,
);
check(
    "form rejects ending after 19",
    !step2Form.safeParse({
        ...input,
        arriveTime: "17:30",
        reserveTime: "18:00",
    }).success,
);
mock.timers.reset();
console.log(`${passed} checks passed`);

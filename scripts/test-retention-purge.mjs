// 보유기간 만료 파기 재현 테스트 (#99) — 로컬 전용.
// 처리방침 제4조·제11조 ①: 3년 개인정보 파기, 5년 거래기록 파기,
// active legal hold 보존, Storage API 삭제 후 메타데이터 확정 삭제.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error(
        "❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
    );
    process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    console.error(`❌ 로컬 스택이 아닙니다. 중단합니다: ${url}`);
    process.exit(1);
}

const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const PREFIX = `TEST-99-${Date.now()}`;
const users = [];
const storagePaths = [];
let passed = 0;
let failed = 0;

function check(name, ok, detail) {
    if (ok) {
        passed += 1;
        console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    } else {
        failed += 1;
        console.log(
            `  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ""}`,
        );
    }
}

function yearsAgo(years) {
    const at = new Date();
    at.setUTCFullYear(at.getUTCFullYear() - years);
    return at.toISOString();
}

async function makeProfile(role, suffix) {
    const email = `${PREFIX}-${suffix}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password: "test1234!",
        email_confirm: true,
    });
    if (error) throw error;
    users.push(data.user.id);

    const { error: profileError } = await admin.from("profiles").upsert({
        id: data.user.id,
        role,
        name: `${PREFIX}-${suffix}`,
        phone: `010-${String(users.length).padStart(4, "0")}-9999`,
        email,
        status: "ACTIVE",
    });
    if (profileError) throw profileError;
    return data.user.id;
}

async function makeReservation({ customerId, partnerId, suffix, years }) {
    const { data: reservation, error: reservationError } = await admin
        .from("reservations")
        .insert({
            code: `${PREFIX}-${suffix}`,
            customer_id: customerId,
            status: "COMPLETED",
            plan: "basic",
            patient_name: "파기대상 환자",
            patient_birth: "1950-01-01",
            patient_gender: "female",
            patient_phone: "010-1111-2222",
            guardian_name: "파기대상 보호자",
            guardian_phone: "010-3333-4444",
            relation: "자녀",
            treatment: "민감 검사",
            purpose: "민감 진료 목적",
            cautions: "민감 주의사항",
            other_requests: "자유입력 민감정보",
            use_date: "2020-01-01",
            arrive_time: "09:00",
            reserve_time: "10:00",
            duration: "2시간",
            depart_address: "서울시 상세주소",
            hospital_address: "서울시 병원 상세주소",
            hospital_name: "테스트병원",
            mobility_status: "거동 민감정보",
            cognitive_status: "인지 민감정보",
        })
        .select("id")
        .single();
    if (reservationError) throw reservationError;

    const { data: service, error: serviceError } = await admin
        .from("services")
        .insert({
            reservation_id: reservation.id,
            partner_id: partnerId,
            status: "COMPLETED",
            started_at: yearsAgo(years),
            ended_at: yearsAgo(years),
            start_memo: "민감 시작 메모",
            end_memo: "민감 종료 메모",
        })
        .select("id")
        .single();
    if (serviceError) throw serviceError;

    const { data: report, error: reportError } = await admin
        .from("reports")
        .insert({
            service_id: service.id,
            partner_id: partnerId,
            status: "SUBMITTED",
            supports: ["진료 지원", "기타 민감정보"],
            exam: "민감 검사 결과",
            guardian_note: "보호자 전달 민감정보",
            submitted_at: yearsAgo(years),
        })
        .select("id")
        .single();
    if (reportError) throw reportError;

    return {
        reservationId: reservation.id,
        serviceId: service.id,
        reportId: report.id,
    };
}

async function cleanup() {
    if (storagePaths.length > 0) {
        await admin.storage.from("report-attachments").remove(storagePaths);
    }
    await admin.from("reservations").delete().like("code", `${PREFIX}%`);
    for (const id of users) {
        await admin.auth.admin.deleteUser(id);
    }
}

async function main() {
    const partnerId = await makeProfile("PARTNER", "partner");
    const customer4y = await makeProfile("USER", "four-years");
    const customer6y = await makeProfile("USER", "six-years");
    const customerHold = await makeProfile("USER", "hold");

    console.log("\n▶ 3년 경과 개인정보·첨부 파기");
    const fourYears = await makeReservation({
        customerId: customer4y,
        partnerId,
        suffix: "FOUR",
        years: 4,
    });
    const attachmentPath = `${partnerId}/${fourYears.serviceId}/${PREFIX}.pdf`;
    storagePaths.push(attachmentPath);
    const { error: uploadError } = await admin.storage
        .from("report-attachments")
        .upload(
            attachmentPath,
            new Blob(["%PDF-1.4 test attachment"], {
                type: "application/pdf",
            }),
            { contentType: "application/pdf" },
        );
    if (uploadError) throw uploadError;
    const { error: attachmentError } = await admin
        .from("report_attachments")
        .insert({
            report_id: fourYears.reportId,
            kind: "TEST",
            path: attachmentPath,
            filename: `${PREFIX}.pdf`,
            size: 24,
        });
    if (attachmentError) throw attachmentError;

    const { error: firstPurgeError } = await admin.rpc("run_retention_purge");
    if (firstPurgeError) throw firstPurgeError;

    const { data: scrubbed } = await admin
        .from("reservations")
        .select(
            "customer_id, patient_name, treatment, use_date, final_amount, personal_data_purged_at",
        )
        .eq("id", fourYears.reservationId)
        .single();
    check("예약 개인정보가 3년 후 파기된다", scrubbed?.patient_name === null);
    check("회원 연결이 제거된다", scrubbed?.customer_id === null);
    check("파기 시각이 남는다", Boolean(scrubbed?.personal_data_purged_at));

    const { data: scrubbedService } = await admin
        .from("services")
        .select("start_memo, end_memo")
        .eq("id", fourYears.serviceId)
        .single();
    check(
        "서비스 자유입력 메모가 파기된다",
        scrubbedService?.start_memo === null &&
            scrubbedService?.end_memo === null,
    );

    const { data: scrubbedReport } = await admin
        .from("reports")
        .select("supports, exam, guardian_note")
        .eq("id", fourYears.reportId)
        .single();
    check(
        "리포트 민감 본문이 파기된다",
        scrubbedReport?.exam === null &&
            scrubbedReport?.guardian_note === null &&
            scrubbedReport?.supports?.length === 0,
    );

    const { data: candidates, error: candidateError } = await admin.rpc(
        "list_retention_attachment_paths",
        { p_limit: 1000 },
    );
    if (candidateError) throw candidateError;
    check(
        "만료 첨부가 Storage API 삭제 대상으로 조회된다",
        candidates?.some((row) => row.path === attachmentPath),
    );

    const { error: removeError } = await admin.storage
        .from("report-attachments")
        .remove([attachmentPath]);
    if (removeError) throw removeError;
    const { data: confirmed, error: confirmError } = await admin.rpc(
        "confirm_retention_attachment_purge",
        { p_paths: [attachmentPath] },
    );
    if (confirmError) throw confirmError;
    check("Storage 삭제 후 메타데이터를 확정 삭제한다", confirmed === 1);

    console.log("\n▶ 5년 경과 그래프 삭제와 legal hold");
    const sixYears = await makeReservation({
        customerId: customer6y,
        partnerId,
        suffix: "SIX",
        years: 6,
    });
    const held = await makeReservation({
        customerId: customerHold,
        partnerId,
        suffix: "HOLD",
        years: 6,
    });
    const { error: holdError } = await admin
        .from("retention_legal_holds")
        .insert({
            reservation_id: held.reservationId,
            reason: "진행 중인 분쟁 증거 보존",
            held_by: customerHold,
        });
    if (holdError) throw holdError;

    const { error: secondPurgeError } = await admin.rpc("run_retention_purge");
    if (secondPurgeError) throw secondPurgeError;

    const [{ data: deleted }, { data: preserved }] = await Promise.all([
        admin
            .from("reservations")
            .select("id")
            .eq("id", sixYears.reservationId),
        admin
            .from("reservations")
            .select("id, patient_name")
            .eq("id", held.reservationId),
    ]);
    check("5년이 지난 예약·서비스 그래프가 삭제된다", deleted?.length === 0);
    check(
        "active legal hold 예약은 파기되지 않는다",
        preserved?.length === 1 &&
            preserved[0].patient_name === "파기대상 환자",
    );

    await admin
        .from("retention_legal_holds")
        .update({
            released_by: customerHold,
            released_at: new Date().toISOString(),
            release_reason: "분쟁 최종 종료 확인",
        })
        .eq("reservation_id", held.reservationId);
    const { error: releasedPurgeError } = await admin.rpc(
        "run_retention_purge",
    );
    if (releasedPurgeError) throw releasedPurgeError;
    const { data: releasedGone } = await admin
        .from("reservations")
        .select("id")
        .eq("id", held.reservationId);
    check("hold 해제 후 만료 기록이 파기된다", releasedGone?.length === 0);

    const { data: purgeRuns } = await admin
        .from("retention_purge_runs")
        .select("result")
        .order("id", { ascending: false })
        .limit(1);
    check(
        "파기 로그에는 식별자 없이 집계만 남는다",
        Boolean(purgeRuns?.[0]?.result?.at) &&
            !JSON.stringify(purgeRuns?.[0]?.result).includes(PREFIX),
    );
}

try {
    await main();
} catch (error) {
    failed += 1;
    console.error("\n❌ 테스트 실행 오류", error);
} finally {
    await cleanup();
}

console.log(
    `\n${failed === 0 ? "🎉" : "💥"}  ${passed}건 통과 / ${failed}건 실패`,
);
process.exit(failed === 0 ? 0 : 1);

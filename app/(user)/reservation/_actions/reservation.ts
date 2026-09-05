"use server";

import { createClient } from "@/utils/supabase/server";
import { generateReservationCode } from "@/lib/reservation";
import { reservationServerSchema } from "../_lib/schema";
import { quoteReservation } from "../_lib/quote.server";

export type CreateReservationResult =
    | { ok: true; code: string; id: string }
    | { ok: false; reason: "auth" | "validation" | "error"; message: string };

/**
 * 예약 등록 (STEP4 매칭 신청 시점).
 * 로그인 사용자 본인(customer_id)으로 MATCHING 상태 예약을 INSERT 하고 예약번호를 반환한다.
 */
export async function createReservation(
    input: unknown,
): Promise<CreateReservationResult> {
    // 서버 재검증
    const parsed = reservationServerSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            reason: "validation",
            message: "입력값을 다시 확인해 주세요.",
        };
    }
    const v = parsed.data;

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { ok: false, reason: "auth", message: "로그인이 필요합니다." };
    }

    // 요금 스냅샷 — 단가·할증률·선결제액을 예약 시점에 고정한다(#46).
    // 이후 요금표가 바뀌어도 이미 접수된 예약의 금액은 흔들리지 않는다.
    const quote = await quoteReservation(v.plan, v.useDate, v.duration);
    if (!quote) {
        return {
            ok: false,
            reason: "validation",
            message: "예상 소요 시간을 다시 선택해 주세요.",
        };
    }

    const row = {
        customer_id: user.id,
        status: "MATCHING" as const,
        plan: v.plan,
        patient_name: v.userName,
        patient_birth: v.userBirth,
        patient_gender: v.userGender,
        patient_phone: v.userPhone,
        guardian_name: v.guardianName,
        guardian_phone: v.guardianPhone,
        relation: v.relation,
        treatment: v.treatment,
        purpose: v.purpose,
        cautions: v.cautions ?? null,
        mobility_status: v.mobilityStatus,
        cognitive_status: v.cognitiveStatus,
        doc_prescription: v.docPrescription ?? false,
        doc_receipt: v.docReceipt ?? false,
        doc_certificate: v.docCertificate ?? false,
        other_requests: v.otherRequests ?? null,
        use_date: v.useDate,
        arrive_time: v.arriveTime,
        reserve_time: v.reserveTime,
        duration: v.duration,
        depart_address: v.departAddress,
        hospital_name: v.hospitalName,
        hospital_address: v.hospitalAddress,

        // 매뉴얼 1장 업무 시작 조건 (#77)
        notify_target: v.notifyTarget,
        share_medical_info: v.shareMedicalInfo,
        transport_to: v.transportTo,
        transport_home: v.transportHome,
        end_method: v.endMethod,
        // 독립 귀가면 인계자를 받지 않았다. 빈 문자열 대신 null 로 넣어
        // "등록되지 않음" 과 "빈 값" 이 구분되게 한다.
        handover_name: v.handoverName?.trim() || null,
        handover_relation: v.handoverRelation?.trim() || null,
        handover_phone: v.handoverPhone?.trim() || null,
        backup_handover_name: v.backupHandoverName?.trim() || null,
        backup_handover_relation: v.backupHandoverRelation?.trim() || null,
        backup_handover_phone: v.backupHandoverPhone?.trim() || null,

        duration_minutes: quote.durationMinutes,
        hourly_rate: quote.hourlyRate,
        fee_rate: quote.feeRate,
        surcharge_rate: quote.surchargeRate,
        prepaid_amount: quote.amount,
    };

    // 예약번호 충돌(23505) 시 최대 5회 재시도
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateReservationCode();
        const { data, error } = await supabase
            .from("reservations")
            .insert({ ...row, code })
            .select("id, code")
            .single();

        if (!error && data) {
            return { ok: true, code: data.code, id: data.id };
        }
        if (error?.code === "23505") continue; // 예약번호 중복 → 재생성
        if (error) {
            console.error("[createReservation] insert 실패:", error);
            return {
                ok: false,
                reason: "error",
                message:
                    "예약 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            };
        }
    }

    return {
        ok: false,
        reason: "error",
        message: "예약 등록에 실패했습니다. 다시 시도해 주세요.",
    };
}

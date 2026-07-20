"use server";

import { createClient } from "@/utils/supabase/server";
import { reservationServerSchema } from "../_lib/schema";

export type CreateReservationResult =
    | { ok: true; code: string; id: string }
    | { ok: false; reason: "auth" | "validation" | "error"; message: string };

/** 예약번호 생성 — R{yyyymmdd}-{4자리} */
function generateCode(): string {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    return `R${ymd}-${rand}`;
}

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
        doc_prescription: v.docPrescription ?? false,
        doc_receipt: v.docReceipt ?? false,
        doc_certificate: v.docCertificate ?? false,
        other_requests: v.otherRequests ?? null,
        use_date: v.useDate,
        arrive_time: v.arriveTime,
        reserve_time: v.reserveTime,
        duration: v.duration,
        depart_address: v.departAddress,
        hospital_address: v.hospitalAddress,
    };

    // 예약번호 충돌(23505) 시 최대 5회 재시도
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
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

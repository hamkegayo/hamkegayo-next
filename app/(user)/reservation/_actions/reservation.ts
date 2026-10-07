"use server";

import { after } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifiedRegionCode } from "@/lib/address-token.server";
import { generateReservationCode } from "@/lib/reservation";
import { reservationServerSchema } from "../_lib/schema";
import { quoteReservation } from "../_lib/quote.server";
import { notifyPartnersOfNewRequest } from "@/lib/partner-new-request.server";

export type CreateReservationResult =
    | { ok: true; code: string; id: string }
    | {
          ok: false;
          reason: "auth" | "validation" | "error" | "unpaid";
          message: string;
      };

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
        // 일정 문제는 이유를 그대로 보여준다. "입력값을 확인하세요" 만
        // 띄우면 어느 칸이 문제인지 알 수 없어 같은 신청을 반복하게 된다.
        const actionableIssue = parsed.error.issues.find((i) =>
            ["userBirth", "useDate", "arriveTime", "reserveTime"].includes(
                String(i.path[0] ?? ""),
            ),
        );
        return {
            ok: false,
            reason: "validation",
            message: actionableIssue?.message ?? "입력값을 다시 확인해 주세요.",
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

    // 약관 제22조 ③ — 미납금이 전액 지급될 때까지 신규 예약을 제한한다.
    // 기한이 지난 건만 걸린다. 링크를 보낸 직후부터 막으면 결제할 시간을
    // 주지 않고 제재하는 셈이 된다.
    const { data: unpaid } = await supabase.rpc("has_unpaid_charge", {
        p_user_id: user.id,
    });
    if (unpaid === true) {
        return {
            ok: false,
            reason: "unpaid",
            message:
                "미결제 금액이 있어 새 예약을 신청할 수 없습니다. 마이페이지에서 결제를 완료해 주세요.",
        };
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
            await recordRegionCodes(data.id, user.id, v);
            // 활동 지역·시간이 맞는 파트너에게 새 요청 알림 (#255). 응답을 막지 않게 응답 후 처리한다.
            after(() =>
                notifyPartnersOfNewRequest({
                    reservationId: data.id,
                    useDate: v.useDate,
                    arriveTime: v.arriveTime,
                    plan: v.plan,
                    hospitalAddress: v.hospitalAddress,
                }),
            );
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

/**
 * 주소 검색으로 고른 법정동코드를 서버 검증 후 기록한다 (#232 리뷰).
 *
 * 브라우저가 보낸 코드는 믿지 않는다. 서버가 서명한 "기준 주소 ↔ 코드" 토큰이 맞고
 * 최종 입력 주소가 그 기준 주소로 시작할 때만 인정한다. 고객 권한으로는 DB 트리거가
 * 코드를 무시하므로(마이그레이션 92) 서비스 권한으로 기록한다.
 * 실패해도 예약은 그대로 두고, 매칭은 주소 글자로 대신 판정한다.
 */
async function recordRegionCodes(
    reservationId: string,
    customerId: string,
    v: {
        departAddress: string;
        hospitalAddress: string;
        departRegionCode?: string;
        departRegionToken?: string;
        departRegionBase?: string;
        hospitalRegionCode?: string;
        hospitalRegionToken?: string;
        hospitalRegionBase?: string;
    },
): Promise<void> {
    const depart = verifiedRegionCode({
        address: v.departAddress,
        base: v.departRegionBase,
        code: v.departRegionCode,
        token: v.departRegionToken,
    });
    const hospital = verifiedRegionCode({
        address: v.hospitalAddress,
        base: v.hospitalRegionBase,
        code: v.hospitalRegionCode,
        token: v.hospitalRegionToken,
    });
    if (!depart && !hospital) return;
    try {
        const { error } = await createAdminClient()
            .from("reservations")
            .update({
                depart_region_code: depart,
                hospital_region_code: hospital,
            })
            .eq("id", reservationId)
            .eq("customer_id", customerId);
        if (error)
            console.error("[createReservation] 지역 코드 기록 실패:", error);
    } catch (e) {
        console.error("[createReservation] 지역 코드 기록 실패:", e);
    }
}

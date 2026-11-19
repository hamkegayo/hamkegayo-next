"use server";

import { after } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifiedRegionCode } from "@/lib/address-token.server";
import { generateReservationCode } from "@/lib/reservation";
import { reservationServerSchema } from "../_lib/schema";
import { quoteReservation } from "../_lib/quote.server";
import { PRIVACY } from "@/lib/legal/privacy";
import { resolveConsentMode } from "@/lib/proxy-consent";
import { issueConsentLink } from "@/lib/proxy-consent-issue.server";
import { notifyPartnersOfNewRequest } from "@/lib/partner-new-request.server";
import {
    newReservationMatchingMode,
    type MatchingMode,
} from "@/lib/direct-assignment";

/** 이용자 본인 동의 대기 중 예약의 동의 링크 안내 (처리방침 제10조 ②, #306) */
export type PendingConsentInfo = {
    status: "PENDING_USER";
    link: string;
    expiresAt: string;
    /** 시스템이 이용자에게 직접 보냈는지. false 면 보호자가 링크를 전달해야 한다 */
    delivered: boolean;
};

export type CreateReservationResult =
    | {
          ok: true;
          code: string;
          id: string;
          matchingMode: MatchingMode;
          /** 본인 동의 대기 중일 때만 있다 */
          consent?: PendingConsentInfo;
      }
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
            [
                "userBirth",
                "useDate",
                "arriveTime",
                "reserveTime",
                "agreePreMatchingHealth",
                "consentMode",
                "proxyReasonCode",
                "proxyReasonDetail",
                "proxyAuthorityPledge",
            ].includes(String(i.path[0] ?? "")),
        );
        return {
            ok: false,
            reason: "validation",
            message: actionableIssue?.message ?? "입력값을 다시 확인해 주세요.",
        };
    }
    const v = parsed.data;
    // 처리방침 제10조 — 본인 예약(SELF) / 이용자 본인 직접 동의(USER_DIRECT, 원칙) / 보호자 대리 동의(GUARDIAN_PROXY, 예외)
    const consentMode = resolveConsentMode(v);
    if (!consentMode) {
        return {
            ok: false,
            reason: "validation",
            message: "동의 방식을 선택해 주세요.",
        };
    }
    // 본인 직접 동의가 아니면 이 화면에서 거동·인지 상태 제공 동의를 받아야 한다 (#285).
    if (consentMode !== "USER_DIRECT" && v.agreePreMatchingHealth !== true) {
        return {
            ok: false,
            reason: "validation",
            message:
                "거동·인지 상태의 매칭 전 파트너 제공에 동의하지 않으면 예약할 수 없습니다.",
        };
    }
    const regionCodes = {
        depart: verifiedRegionCode({
            address: v.departAddress,
            base: v.departRegionBase,
            code: v.departRegionCode,
            token: v.departRegionToken,
        }),
        hospital: verifiedRegionCode({
            address: v.hospitalAddress,
            base: v.hospitalRegionBase,
            code: v.hospitalRegionCode,
            token: v.hospitalRegionToken,
        }),
    };
    for (const code of [regionCodes.depart, regionCodes.hospital]) {
        if (!code) {
            return {
                ok: false,
                reason: "validation",
                message:
                    "출발지와 병원 기본 주소를 주소 검색으로 다시 선택해 주세요.",
            };
        }
    }

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
        // 처리방침 제5조 ② [단계 1]·④⑥ — 매칭 전 최소 건강정보 제공 동의 기록 (#285).
        // 본인 직접 동의(제10조 ①②)는 이용자가 동의 링크에서 직접 하므로 그때까지 비워 둔다.
        // 시각은 DB 트리거가 서버 시각으로 덮어쓴다.
        pre_matching_health_consented_at:
            consentMode === "USER_DIRECT" ? null : new Date().toISOString(),
        pre_matching_health_consent_version:
            consentMode === "USER_DIRECT" ? null : PRIVACY.version,
        // 처리방침 제10조 — 동의 주체·상태. 확정·시각은 DB 가 서버 시각으로 기록하고 사후 변경을 막는다.
        user_consent_mode: consentMode,
        user_consent_status:
            consentMode === "SELF"
                ? ("NOT_REQUIRED" as const)
                : consentMode === "USER_DIRECT"
                  ? ("PENDING_USER" as const)
                  : ("CONFIRMED" as const),
        // 제10조 ③ — 보호자 대리 동의의 사유·권한 확인(서약)
        ...(consentMode === "GUARDIAN_PROXY"
            ? {
                  proxy_reason_code: v.proxyReasonCode,
                  proxy_reason_detail: v.proxyReasonDetail?.trim(),
                  proxy_authority_version: PRIVACY.version,
              }
            : {}),
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
        // 제10조 ④ — 진료 내용 전달 동의는 실제 이용자만 한다. 본인 예약은 본인이 고른 값,
        // 본인 직접 동의는 이용자가 링크에서 고를 때까지 false, 보호자 대리 동의는 false 로 고정한다.
        share_medical_info: consentMode === "SELF" ? v.shareMedicalInfo : false,
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
            await recordRegionCodes(data.id, user.id, regionCodes);

            // 제10조 ② — 이용자 본인 직접 동의 대기: 동의 링크를 발급한다. 발급에 실패하면 본인에게 안내할
            // 방법이 없는 예약이 남으므로 예약을 지우고 실패로 돌려준다. 파트너 알림은 동의 확정 뒤에 나간다.
            let consent: PendingConsentInfo | undefined;
            if (consentMode === "USER_DIRECT") {
                const issued = await issueConsentLink(supabase, {
                    reservationId: data.id,
                    patientPhone: v.userPhone,
                });
                if (!issued.ok) {
                    const { error: rollbackError } = await createAdminClient()
                        .from("reservations")
                        .delete()
                        .eq("id", data.id)
                        .eq("customer_id", user.id);
                    if (rollbackError) {
                        // 삭제까지 실패하면 링크 없는 PENDING_USER 예약이 남는다 — 운영이 찾을 수 있게 남긴다.
                        console.error(
                            "[createReservation] 동의 링크 발급 실패 후 예약 삭제 실패:",
                            data.id,
                            rollbackError.message,
                        );
                    }
                    return {
                        ok: false,
                        reason: "error",
                        message:
                            "이용자 본인 동의 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
                    };
                }
                consent = {
                    status: "PENDING_USER",
                    link: issued.link,
                    expiresAt: issued.expiresAt,
                    delivered: issued.delivered,
                };
            }

            // 처리 방식은 서버가 정한다 (#300). 고객 권한 INSERT 는 DB 가드가 항상 legacy_auto 로 되돌리므로
            // 신규 방식(admin_direct) 전환은 서비스 권한으로 기록한다. 플래그가 꺼져 있으면 기존 그대로다.
            // 전환에 실패한 채 두면 고객이 다른 흐름을 만나므로 예약을 지우고 실패로 돌려준다.
            if (newReservationMatchingMode() === "admin_direct") {
                const admin = createAdminClient();
                const { error: modeError } = await admin
                    .from("reservations")
                    .update({ matching_mode: "admin_direct" })
                    .eq("id", data.id)
                    .eq("customer_id", user.id)
                    .eq("status", "MATCHING");
                if (modeError) {
                    console.error(
                        "[createReservation] 처리 방식 기록 실패:",
                        modeError,
                    );
                    await admin
                        .from("reservations")
                        .delete()
                        .eq("id", data.id)
                        .eq("customer_id", user.id);
                    return {
                        ok: false,
                        reason: "error",
                        message:
                            "예약 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
                    };
                }
                // 신규 방식은 파트너 알림·지원을 받지 않는다. DB 도 notify_partners_new_request 에서 막는다.
                return {
                    ok: true,
                    code: data.code,
                    id: data.id,
                    matchingMode: "admin_direct",
                    ...(consent ? { consent } : {}),
                };
            }

            // 활동 지역·시간이 맞는 파트너에게 새 요청 알림 (#255). 응답을 막지 않게 응답 후 처리한다.
            // 본인 동의 대기 건은 알리지 않는다 — 동의 확정 시점에 알린다 (DB 도 notify_partners_new_request 에서 막는다).
            if (!consent) {
                after(() =>
                    notifyPartnersOfNewRequest({
                        reservationId: data.id,
                        useDate: v.useDate,
                        arriveTime: v.arriveTime,
                        plan: v.plan,
                        hospitalAddress: v.hospitalAddress,
                    }),
                );
            }
            return {
                ok: true,
                code: data.code,
                id: data.id,
                matchingMode: "legacy_auto",
                ...(consent ? { consent } : {}),
            };
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
 * createReservation 이 검증한 법정동코드를 기록한다 (#232 리뷰).
 *
 * 브라우저가 보낸 코드는 믿지 않는다. 서버가 서명한 "기준 주소 ↔ 코드" 토큰이 맞고
 * 최종 입력 주소가 그 기준 주소로 시작할 때만 인정한다. 고객 권한으로는 DB 트리거가
 * 코드를 무시하므로(마이그레이션 92) 서비스 권한으로 기록한다.
 * 실패해도 예약은 그대로 두고, 매칭은 주소 글자로 대신 판정한다.
 */
async function recordRegionCodes(
    reservationId: string,
    customerId: string,
    { depart, hospital }: { depart: string | null; hospital: string | null },
): Promise<void> {
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

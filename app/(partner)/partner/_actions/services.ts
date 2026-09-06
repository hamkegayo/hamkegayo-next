"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createNotification } from "@/lib/notifications";
import { issueExtensionCharge } from "@/lib/payments/extension";
import { enqueueSettlementRefund } from "@/lib/payments/settlement-refund";
import {
    finalizeNoShowCharge,
    finalizeServiceCharge,
} from "../../_lib/finalize-charge";
import { formatMinutes } from "@/lib/pricing";
import type { ServiceTimeField } from "../../_lib/service-times";

export type ServiceActionResult = { ok: true } | { ok: false; message: string };

const ERROR_MESSAGE: Record<string, string> = {
    service_not_found: "서비스를 찾을 수 없습니다.",
    not_partner: "본인 서비스만 처리할 수 있습니다.",
    invalid_state: "지금은 처리할 수 없는 상태입니다.",
    already_arrived: "이미 도착이 기록되었습니다.",
    // 매뉴얼 4단계 — 일찍 도착해도 예약시각 정각에 시작한다.
    too_early: "예약시각 이후에 진행할 수 있습니다.",
    invalid_field: "기록할 수 없는 항목입니다.",
    invalid_kind: "신고할 수 없는 종류입니다.",
    // 대응카드 26 — "실제 시각" 은 이미 지난 일이다.
    future_time: "아직 오지 않은 시각은 적을 수 없습니다.",
};

/** 서비스 행에 연결된 고객 id (알림 수신자) */
async function getCustomerId(serviceId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("services")
        .select("reservations!inner(customer_id)")
        .eq("id", serviceId)
        .maybeSingle<{ reservations: { customer_id: string } | null }>();
    return data?.reservations?.customer_id ?? null;
}

async function callRpc(
    fn:
        | "start_service"
        | "end_service"
        | "complete_service"
        | "arrive_service"
        | "record_service_time"
        | "end_service_no_show"
        | "report_service_notice",
    args: Record<string, unknown>,
    serviceId: string,
): Promise<ServiceActionResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { error } = await supabase.rpc(fn, args);
    if (error) {
        const key = Object.keys(ERROR_MESSAGE).find((k) =>
            error.message.includes(k),
        );
        return {
            ok: false,
            message: key
                ? ERROR_MESSAGE[key]
                : "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    revalidatePath("/partner/management");
    revalidatePath(`/partner/management/${serviceId}`);
    return { ok: true };
}

/**
 * 현장 도착 통보 (상태 전이 없이 도착 시각만 기록).
 *  - 약관 제12조 ③ : 파트너 도착 시 예약자에게 도착 사실을 안내한다.
 *  - 약관 제16조 ① : 이 시각이 과금 시작 기준이 되어 파트너 지각분이 청구에서 빠진다.
 */
export async function arriveService(
    serviceId: string,
): Promise<ServiceActionResult> {
    const res = await callRpc(
        "arrive_service",
        { p_service_id: serviceId },
        serviceId,
    );
    if (res.ok) {
        const customerId = await getCustomerId(serviceId);
        if (customerId) {
            await createNotification(customerId, {
                type: "PARTNER_ARRIVED",
                title: "파트너가 도착했어요",
                body: "파트너가 약속 장소에 도착했습니다.",
                link: "/mypage/reservations",
            });
        }
    }
    return res;
}

/**
 * 진행 시각을 기록한다. **시각은 서버가 찍는다** — 매뉴얼이 임의 시각 입력을
 * 금지하기 때문이다(4·13단계·대응카드 26). 두 번 눌러도 처음 시각이 남는다.
 */
export async function recordServiceTime(
    serviceId: string,
    field: ServiceTimeField,
): Promise<ServiceActionResult> {
    return callRpc(
        "record_service_time",
        { p_service_id: serviceId, p_field: field },
        serviceId,
    );
}

/**
 * 예정 종료시각 초과 고지 — 매뉴얼 대응카드 13.
 *
 *  ⚠️ 이것은 "연장 동의" 가 아니다. 매뉴얼은 **추가시간을 현장에서
 *     확정하는 것을 금지**하고, 이용자·보호자에게 예상 종료시각을 알린 뒤
 *     운영센터에 보고하라고만 정한다. 약관에도 연장 동의 절차는 없다 —
 *     제11조 ⑥ 은 8분을 넘기면 실제 시간으로 산정한다고만 한다.
 *
 *  남기는 이유는 분쟁이다. 서비스가 끝난 뒤 추가결제 링크가 나갔을 때
 *  보호자가 "들은 적 없다" 고 하면 지금은 반박할 자료가 하나도 없다.
 */
export async function reportOverrunNotice(
    serviceId: string,
    input: {
        /** 알린 실제 시각 (ISO) */
        occurredAt: string;
        notifiedTo: "USER" | "GUARDIAN" | "BOTH";
        /** 알린 예상 종료시각 (ISO). 모르면 null */
        expectedEndAt: string | null;
        /** 지연 사유와 남은 업무. ⚠️ 개인정보를 적지 않는다. */
        detail: string;
    },
): Promise<ServiceActionResult> {
    return callRpc(
        "report_service_notice",
        {
            p_service_id: serviceId,
            p_kind: "OVERRUN_NOTICE",
            p_occurred_at: input.occurredAt,
            p_notified_to: input.notifiedTo,
            p_expected_end_at: input.expectedEndAt,
            p_detail: input.detail,
        },
        serviceId,
    );
}

/**
 * 시작·종료 버튼 오류 신고 — 매뉴얼 대응카드 26.
 *
 *  파트너는 신고만 한다. 시각 정정은 운영센터가 사유를 남기고 한다
 *  (admin_correct_service_time). 매뉴얼이 "임의의 시각을 입력하지
 *  않는다" 고 정하므로 파트너에게 정정 경로를 열지 않는다.
 */
export async function reportButtonError(
    serviceId: string,
    input: {
        /** 버튼을 누른 실제 시각 (ISO) */
        occurredAt: string;
        /** 화면에 표시된 오류 문구 */
        errorText: string;
        /** 통신상태 등. ⚠️ 개인정보를 적지 않는다. */
        detail: string;
    },
): Promise<ServiceActionResult> {
    return callRpc(
        "report_service_notice",
        {
            p_service_id: serviceId,
            p_kind: "BUTTON_ERROR",
            p_occurred_at: input.occurredAt,
            p_error_text: input.errorText,
            p_detail: input.detail,
        },
        serviceId,
    );
}

/**
 * 이용자 미도착 종료 — 약관 제15조 ③④ · 대응카드 03.
 *
 *  시작 후 20분이 지나야 호출할 수 있다. 그 전에 떠나는 것을 매뉴얼이
 *  금지하므로 서버가 거절한다.
 */
export async function endServiceNoShow(
    serviceId: string,
): Promise<ServiceActionResult> {
    const res = await callRpc(
        "end_service_no_show",
        { p_service_id: serviceId },
        serviceId,
    );

    if (res.ok) {
        // 노쇼도 정산 경로를 탄다(#75). 약관 제19조가 1시간 이용요금을 정하고
        // 선결제(최소 2시간)와의 차액이 부호에 따라 추가결제 또는 환불로 갈린다.
        const final = await finalizeNoShowCharge(serviceId);

        if (final) {
            const penalty = final.charge.total.toLocaleString();

            if (final.diff.additional > 0) {
                // 출동비용 실비가 더해져 선결제를 넘는 경우다. 아직 실비가
                // 정해지지 않아 현재 요금표에서는 발생하지 않는다.
                await issueExtensionCharge({
                    reservationId: final.reservationId,
                    reservationCode: final.reservationCode,
                    customerId: final.customerId,
                    amount: final.diff.additional,
                    reason: "NO_SHOW",
                    useDate: final.useDate,
                });
            } else if (final.diff.refund > 0) {
                // 선결제가 위약금보다 크다 — 잔액을 돌려줘야 한다.
                // 미달분과 같은 승인 큐를 거친다(#76).
                await enqueueSettlementRefund({
                    reservationId: final.reservationId,
                    amount: final.diff.refund,
                    reason: `이용자 미도착 · 위약금 ${penalty}원 차감`,
                });
            }

            // 문구가 결과와 어긋나면 안 된다. 위약금은 **선결제에서 차감**되는
            // 것이지 따로 청구되는 것이 아니다(리뷰 확정).
            const body =
                final.diff.refund > 0
                    ? `파트너가 예약시각부터 20분간 기다린 뒤 종료했습니다. 약관에 따른 위약금 ${penalty}원을 선결제 금액에서 차감하고, 잔액 ${final.diff.refund.toLocaleString()}원을 확인 후 환불해 드립니다.`
                    : `파트너가 예약시각부터 20분간 기다린 뒤 종료했습니다. 약관에 따른 위약금 ${penalty}원이 선결제 금액에서 처리됩니다.`;

            await createNotification(final.customerId, {
                type: "RESERVATION_CANCELLED",
                title: "약속 장소에서 만나지 못했어요",
                body,
                link: "/mypage/reservations",
            });
        } else {
            const customerId = await getCustomerId(serviceId);
            if (customerId) {
                await createNotification(customerId, {
                    type: "RESERVATION_CANCELLED",
                    title: "약속 장소에서 만나지 못했어요",
                    body: "파트너가 예약시각부터 20분간 기다린 뒤 종료했습니다. 자세한 내용은 고객센터로 문의해 주세요.",
                    link: "/mypage/reservations",
                });
            }
        }
    }
    return res;
}

/** 서비스 시작 (SCHEDULED → IN_PROGRESS) */
export async function startService(
    serviceId: string,
    memo?: string,
): Promise<ServiceActionResult> {
    return callRpc(
        "start_service",
        { p_service_id: serviceId, p_memo: memo?.trim() || null },
        serviceId,
    );
}

/**
 * 서비스 종료 (IN_PROGRESS → ENDED).
 * 종료 시각이 확정되므로 곧바로 최종 이용요금을 산정해 예약에 기록하고,
 * 환불/추가결제가 발생하면 고객에게 안내한다 (약관 제21조 ③④⑤ · 제22조 ①).
 */
export async function endService(
    serviceId: string,
    memo?: string,
): Promise<ServiceActionResult> {
    const res = await callRpc(
        "end_service",
        { p_service_id: serviceId, p_memo: memo?.trim() || null },
        serviceId,
    );
    if (!res.ok) return res;

    const final = await finalizeServiceCharge(serviceId);
    if (final) {
        const { charge, diff, customerId } = final;
        const usage = `이용시간 ${formatMinutes(charge.billedMinutes)} · 최종 요금 ${charge.total.toLocaleString()}원`;

        if (diff.additional > 0) {
            // 링크 발급과 안내는 모듈이 함께 처리한다(#75). 소프트 상한을
            // 넘으면 링크를 보내지 않고 관리자에게만 알린다.
            await issueExtensionCharge({
                reservationId: final.reservationId,
                reservationCode: final.reservationCode,
                customerId,
                amount: diff.additional,
                reason: "EXTENSION",
                useDate: final.useDate,
            });
        } else if (diff.refund > 0) {
            // 미달분은 자동으로 나가지 않는다. 종료 시각이 잘못 눌렸을 수 있어
            // 관리자가 한 번 확인한 뒤 집행한다(#76, 2026-09-05 기획 확정).
            await enqueueSettlementRefund({
                reservationId: final.reservationId,
                amount: diff.refund,
                reason: usage,
            });

            await createNotification(customerId, {
                type: "PAYMENT_REFUND",
                title: "결제 금액이 환불될 예정이에요",
                body: `${usage}. 선결제 금액 중 ${diff.refund.toLocaleString()}원을 확인 후 환불해 드립니다. 완료되면 다시 알려드릴게요.`,
                link: "/mypage/reservations",
            });
        }
    }

    return res;
}

/** 서비스 완료 (ENDED → COMPLETED, 예약도 COMPLETED) */
export async function completeService(
    serviceId: string,
): Promise<ServiceActionResult> {
    const res = await callRpc(
        "complete_service",
        { p_service_id: serviceId },
        serviceId,
    );
    if (res.ok) {
        const customerId = await getCustomerId(serviceId);
        if (customerId) {
            await createNotification(customerId, {
                type: "SERVICE_COMPLETED",
                title: "서비스가 완료되었어요",
                body: "동행이 안전하게 마무리됐어요. 이용 후기를 남겨주세요.",
                link: "/review/write",
            });
        }
    }
    return res;
}

"use server";

import { createClient } from "@/utils/supabase/server";
import { issueConsentLink } from "@/lib/proxy-consent-issue.server";
import type { UserConsentMode, UserConsentStatus } from "@/lib/proxy-consent";

/**
 * 대리 예약 이용자 본인 동의 — 보호자 쪽 서버 액션 (처리방침 제10조 ①②, #306).
 * 모두 로그인한 예약자 본인의 예약만 대상이며, 소유 확인은 RLS 와 RPC(auth.uid())가 한다.
 */

export type ConsentStatusResult = {
    mode: UserConsentMode;
    status: UserConsentStatus;
    /** 예약 자체의 상태. 취소·만료된 예약이면 동의를 더 받지 않는다 */
    reservationStatus: string;
    useDate: string;
    arriveTime: string;
};

export async function getConsentStatus(
    reservationId: string,
): Promise<ConsentStatusResult | null> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("reservations")
        .select(
            "user_consent_mode, user_consent_status, status, use_date, arrive_time",
        )
        .eq("id", reservationId)
        .maybeSingle();
    if (!data) return null;
    return {
        mode: data.user_consent_mode as UserConsentMode,
        status: data.user_consent_status as UserConsentStatus,
        reservationStatus: data.status as string,
        useDate: data.use_date as string,
        arriveTime: data.arrive_time as string,
    };
}

export type ReissueConsentLinkResult =
    | { ok: true; link: string; expiresAt: string; delivered: boolean }
    | { ok: false; message: string };

/** 만료됐거나 아직 완료되지 않은 본인 동의 링크를 다시 발급한다. 이전 링크는 즉시 폐기된다. */
export async function reissueConsentLink(
    reservationId: string,
): Promise<ReissueConsentLinkResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { data: r } = await supabase
        .from("reservations")
        .select("patient_phone, user_consent_status")
        .eq("id", reservationId)
        .maybeSingle();
    if (!r) return { ok: false, message: "예약을 찾을 수 없습니다." };
    if (r.user_consent_status !== "PENDING_USER") {
        return { ok: false, message: "이미 본인 동의가 완료된 예약입니다." };
    }

    const issued = await issueConsentLink(supabase, {
        reservationId,
        patientPhone: r.patient_phone as string,
    });
    if (issued.ok) {
        return {
            ok: true,
            link: issued.link,
            expiresAt: issued.expiresAt,
            delivered: issued.delivered,
        };
    }
    const message: Record<string, string> = {
        rate_limited:
            "링크를 너무 자주 다시 만들었습니다. 1시간 뒤에 다시 시도해 주세요.",
        window_closed:
            "서비스 시작이 임박해 본인 동의 링크를 더 만들 수 없습니다. 예약을 취소하고 다시 신청해 주세요.",
        not_pending: "이미 본인 동의가 완료되었거나 처리할 수 없는 예약입니다.",
        error: "링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
    return { ok: false, message: message[issued.reason] };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    buildConsentLink,
    generateConsentToken,
} from "./proxy-consent-token.server";
import {
    deliverConsentLink,
    getConsentDelivery,
    type ConsentDeliveryChannel,
} from "./proxy-consent-delivery.server";

export type IssuedConsentLink =
    | {
          ok: true;
          link: string;
          expiresAt: string;
          channel: ConsentDeliveryChannel;
          /** 시스템이 이용자에게 직접 보냈는지 (false 면 보호자가 링크를 전달) */
          delivered: boolean;
      }
    | {
          ok: false;
          reason: "rate_limited" | "window_closed" | "not_pending" | "error";
      };

/**
 * 이용자 본인 동의 링크를 발급(재발급)한다 — 처리방침 제10조 ②.
 * 고객 세션 클라이언트로 호출해야 한다(RPC 가 auth.uid() 로 소유자를 확인한다).
 * 이전 미사용 토큰은 DB 가 폐기하고, 만료는 24시간 또는 서비스 시작 전 중 빠른 쪽이다.
 */
export async function issueConsentLink(
    supabase: SupabaseClient,
    input: { reservationId: string; patientPhone: string },
): Promise<IssuedConsentLink> {
    const { token, hash } = generateConsentToken();
    const delivery = getConsentDelivery();

    const { data, error } = await supabase.rpc("issue_user_consent_token", {
        p_reservation_id: input.reservationId,
        p_token_hash: hash,
        // 실제 발송 여부는 전달 시도 뒤에 알 수 있어, 기본 수단을 기록한다. 발송 어댑터가 없으면 MANUAL_LINK.
        p_delivery_channel: delivery.channel,
    });
    if (error || typeof data !== "string") {
        const msg = error?.message ?? "";
        if (msg.includes("consent_token_rate_limited"))
            return { ok: false, reason: "rate_limited" };
        if (msg.includes("consent_window_closed"))
            return { ok: false, reason: "window_closed" };
        if (msg.includes("consent_not_pending"))
            return { ok: false, reason: "not_pending" };
        console.error("[proxy-consent] 토큰 발급 실패:", error?.code);
        return { ok: false, reason: "error" };
    }

    const link = await buildConsentLink(token);
    const result = await deliverConsentLink(
        {
            reservationId: input.reservationId,
            patientPhone: input.patientPhone,
            link,
            expiresAt: data,
        },
        delivery,
    );
    return {
        ok: true,
        link,
        expiresAt: data,
        channel: result.channel,
        delivered: result.delivered,
    };
}

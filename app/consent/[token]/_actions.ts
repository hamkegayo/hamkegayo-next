"use server";

import { after } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";
import { PRIVACY } from "@/lib/legal/privacy";
import { notifyPartnersOfNewRequest } from "@/lib/partner-new-request.server";
import {
    hashConsentToken,
    isWellFormedConsentToken,
} from "@/lib/proxy-consent-token.server";
import { isCalendarDate } from "@/lib/reservation-window";

/**
 * 이용자 본인 동의 — 로그인 없이 서명 링크(토큰)로 접근하는 공개 액션 (처리방침 제10조 ①②④, #306).
 *
 * 토큰 원문은 여기서 해시해 DB 에 넘긴다. 본인 확인(생년월일 + 연락처 끝 4자리)·실패 횟수 제한·동의 확정은
 * service_role 전용 RPC 가 하고, 제출 때도 본인 확인을 다시 검증한다 (세션·쿠키 없이 동작).
 */

export type ConsentTokenState =
    | "VALID"
    | "EXPIRED"
    | "USED"
    | "REVOKED"
    | "LOCKED"
    | "CLOSED"
    | "NOT_FOUND";

export async function getConsentTokenState(
    token: string,
): Promise<ConsentTokenState> {
    if (!isWellFormedConsentToken(token)) return "NOT_FOUND";
    const { data, error } = await createAdminClient().rpc(
        "get_user_consent_token_state",
        { p_token_hash: hashConsentToken(token) },
    );
    if (error || typeof data !== "string") return "NOT_FOUND";
    return data as ConsentTokenState;
}

export type ConsentContext = {
    plan: string;
    useDate: string;
    arriveTime: string;
    hospitalName: string;
    guardianName: string;
    relation: string;
    expiresAt: string;
};

type FailReason = "MISMATCH" | "INVALID_INPUT" | ConsentTokenState | "ERROR";

export type VerifyIdentityResult =
    | { ok: true; context: ConsentContext }
    | { ok: false; reason: FailReason; attemptsLeft?: number };

function validIdentityInput(birth: string, last4: string) {
    return isCalendarDate(birth) && /^\d{4}$/.test(last4);
}

export async function verifyConsentIdentity(
    token: string,
    birth: string,
    phoneLast4: string,
): Promise<VerifyIdentityResult> {
    if (!isWellFormedConsentToken(token))
        return { ok: false, reason: "NOT_FOUND" };
    if (!validIdentityInput(birth, phoneLast4))
        return { ok: false, reason: "INVALID_INPUT" };

    const { data, error } = await createAdminClient().rpc(
        "verify_user_consent_identity",
        {
            p_token_hash: hashConsentToken(token),
            p_birth: birth,
            p_phone_last4: phoneLast4,
        },
    );
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return { ok: false, reason: "ERROR" };

    if (row.result !== "OK") {
        return {
            ok: false,
            reason: row.result as FailReason,
            attemptsLeft: row.attempts_left ?? 0,
        };
    }
    return {
        ok: true,
        context: {
            plan: row.plan,
            useDate: row.use_date,
            arriveTime: row.arrive_time,
            hospitalName: row.hospital_name,
            guardianName: row.guardian_name,
            relation: row.relation,
            expiresAt: row.expires_at,
        },
    };
}

export type SubmitConsentResult =
    | { ok: true }
    | {
          ok: false;
          reason: FailReason | "HEALTH_CONSENT_REQUIRED";
          attemptsLeft?: number;
      };

/**
 * 이용자 본인이 거동·인지 상태 제공 동의(agreeHealth)와 진료 내용 전달 동의(shareMedical)를 직접 제출한다.
 * 동의 시각·버전은 서버(DB)가 기록한다. 성공하면 이제서야 파트너 매칭이 열리므로 새 요청 알림을 보낸다.
 */
export async function submitUserConsent(input: {
    token: string;
    birth: string;
    phoneLast4: string;
    agreeHealth: boolean;
    shareMedical: boolean;
}): Promise<SubmitConsentResult> {
    const { token, birth, phoneLast4 } = input;
    if (!isWellFormedConsentToken(token))
        return { ok: false, reason: "NOT_FOUND" };
    if (!validIdentityInput(birth, phoneLast4))
        return { ok: false, reason: "INVALID_INPUT" };
    if (input.agreeHealth !== true)
        return { ok: false, reason: "HEALTH_CONSENT_REQUIRED" };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("submit_user_consent", {
        p_token_hash: hashConsentToken(token),
        p_birth: birth,
        p_phone_last4: phoneLast4,
        p_agree_health: true,
        p_share_medical: input.shareMedical === true,
        p_policy_version: PRIVACY.version,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return { ok: false, reason: "ERROR" };
    if (row.result !== "OK") {
        return {
            ok: false,
            reason: row.result as FailReason | "HEALTH_CONSENT_REQUIRED",
        };
    }

    // 동의가 확정되어 매칭이 열렸다 — 보류했던 새 요청 알림을 보낸다 (기존 방식 예약만).
    const reservationId = row.reservation_id as string;
    after(async () => {
        // 동의는 이미 확정됐다. 알림만 빠지면 재시도가 없으므로 실패를 예약 ID 와 함께 남긴다.
        // 나갔는지 점검할 때는 알림 중복 방지 키 new-request:<예약 ID> 로 notifications 를 조회한다.
        try {
            const { data: r, error } = await admin
                .from("reservations")
                .select(
                    "use_date, arrive_time, plan, hospital_address, matching_mode",
                )
                .eq("id", reservationId)
                .maybeSingle();
            if (error) throw error;
            if (!r || r.matching_mode !== "legacy_auto") return;
            await notifyPartnersOfNewRequest({
                reservationId,
                useDate: r.use_date as string,
                arriveTime: r.arrive_time as string,
                plan: r.plan as string,
                hospitalAddress: r.hospital_address as string,
            });
        } catch (e) {
            console.error(
                "[consent] 동의 확정 후 파트너 알림 실패:",
                reservationId,
                e instanceof Error ? e.message : e,
            );
        }
    });
    return { ok: true };
}

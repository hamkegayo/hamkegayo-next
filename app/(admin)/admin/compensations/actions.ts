"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { COMPENSATION_ENABLED } from "./kinds";

/**
 * 귀책 보상 포인트 지급·회수 (#250, 약관 제16조 ⑧ · 제19조 ③).
 * 권한(전체/정산 + MFA)·금액 상한·중복 확인·감사 기록·고객 알림은 모두 DB 함수가 한다.
 */

export type CompensationTarget = {
    reservationId: string;
    code: string;
    status: string;
    useDate: string | null;
    customerName: string | null;
    partnerName: string | null;
    terminationKind: string | null;
    noShow: boolean;
    grantedTotal: number;
    grantCount: number;
};

type Result<T = undefined> =
    | ({ ok: true } & (T extends undefined ? object : { data: T }))
    | { ok: false; message: string };

const MESSAGE: Record<string, string> = {
    on_hold: "귀책 보상 지급은 현재 운영 보류 중입니다.",
    forbidden: "전체/정산 권한과 2단계 인증이 필요합니다.",
    reservation_not_found: "예약번호를 찾을 수 없습니다.",
    not_eligible: "매칭 중인 예약에는 지급할 수 없습니다.",
    invalid_kind: "보상 사유를 선택해 주세요.",
    invalid_amount: "금액은 1-100,000P 사이로 입력해 주세요.",
    reason_required: "사유를 5-500자로 입력해 주세요.",
    evidence_required: "증빙 문서명 또는 관리번호를 입력해 주세요.",
    duplicate_compensation:
        "이 예약에 이미 지급한 보상이 있습니다. 추가 지급이 맞다면 확인란을 체크해 주세요.",
    already_revoked: "이미 회수 처리된 지급입니다.",
    compensation_not_found: "지급 기록을 찾을 수 없습니다.",
};

function toMessage(error: { message: string }): string {
    const key = Object.keys(MESSAGE).find((k) => error.message.includes(k));
    return key
        ? MESSAGE[key]
        : "처리하지 못했습니다. 새로고침 후 이력을 확인해 주세요.";
}

export async function findCompensationTarget(
    code: string,
): Promise<Result<CompensationTarget>> {
    if (!COMPENSATION_ENABLED) return { ok: false, message: MESSAGE.on_hold };
    if (!code.trim())
        return { ok: false, message: "예약번호를 입력해 주세요." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_compensation_target", {
        p_code: code.trim(),
    });
    if (error) return { ok: false, message: toMessage(error) };
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { ok: false, message: MESSAGE.reservation_not_found };
    return {
        ok: true,
        data: {
            reservationId: row.reservation_id,
            code: row.code,
            status: row.status,
            useDate: row.use_date,
            customerName: row.customer_name,
            partnerName: row.partner_name,
            terminationKind: row.termination_kind,
            noShow: row.no_show,
            grantedTotal: row.granted_total,
            grantCount: row.grant_count,
        },
    };
}

export async function grantCompensation(input: {
    reservationId: string;
    kind: string;
    amount: number;
    reason: string;
    evidenceRef: string;
    allowDuplicate: boolean;
}): Promise<Result> {
    if (!COMPENSATION_ENABLED) return { ok: false, message: MESSAGE.on_hold };
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_grant_compensation", {
        p_reservation_id: input.reservationId,
        p_kind: input.kind,
        p_amount: input.amount,
        p_reason: input.reason,
        p_evidence_ref: input.evidenceRef,
        p_allow_duplicate: input.allowDuplicate,
    });
    if (error) return { ok: false, message: toMessage(error) };
    revalidatePath("/admin/compensations");
    return { ok: true };
}

export async function revokeCompensation(input: {
    id: string;
    reason: string;
}): Promise<Result<number>> {
    if (!COMPENSATION_ENABLED) return { ok: false, message: MESSAGE.on_hold };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_revoke_compensation", {
        p_id: input.id,
        p_reason: input.reason,
    });
    if (error) return { ok: false, message: toMessage(error) };
    revalidatePath("/admin/compensations");
    return { ok: true, data: typeof data === "number" ? data : 0 };
}

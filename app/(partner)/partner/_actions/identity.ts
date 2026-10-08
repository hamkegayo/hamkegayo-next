"use server";

import { revalidatePath } from "next/cache";

import { isCalendarDate } from "@/lib/reservation-window";
import { createClient } from "@/utils/supabase/server";

export type IdentityResult = { ok: true } | { ok: false; message: string };

/** 생년월일 제출 (#226). 날짜·나이·수집 허용 여부는 submit_partner_birth_date RPC 가 판정한다. */
export async function submitPartnerBirthDate(
    birthDate: string,
): Promise<IdentityResult> {
    if (typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
        return {
            ok: false,
            message: "생년월일을 YYYY-MM-DD 형식으로 입력해 주세요.",
        };
    // 2000-02-30 같은 값은 DB 날짜 변환에서 먼저 실패해 일반 오류가 된다. 여기서 안내한다.
    if (!isCalendarDate(birthDate))
        return { ok: false, message: "올바른 생년월일을 입력해 주세요." };
    try {
        const supabase = await createClient();
        const { error } = await supabase.rpc("submit_partner_birth_date", {
            p_birth_date: birthDate,
        });
        if (error) {
            const message = error.message.includes(
                "partner_identity_release_pending",
            )
                ? "본인확인 접수는 준비 중입니다."
                : error.message.includes("already_pending")
                  ? "확인 중에는 다시 제출할 수 없습니다. 결과를 기다려 주세요."
                  : error.message.includes("already_verified")
                    ? "이미 본인확인이 완료되었습니다."
                    : error.message.includes("invalid_birth_date")
                      ? "만 18세 이상의 올바른 생년월일을 입력해 주세요."
                      : "제출하지 못했습니다. 다시 시도해 주세요.";
            return { ok: false, message };
        }
        revalidatePath("/partner/profile");
        return { ok: true };
    } catch {
        return {
            ok: false,
            message: "제출 요청에 실패했습니다. 다시 시도해 주세요.",
        };
    }
}

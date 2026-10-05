"use server";

import { randomInt, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getEmailSender } from "@/lib/email";
import { isValidPhone, normalizePhone } from "@/lib/otp";

type Result = { ok: true; id?: string } | { ok: false; message: string };
const failure = {
    ok: false as const,
    message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
const digest = (id: string, phone: string, code: string) =>
    createHash("sha256")
        .update(`partner-phone:${id}:${phone}:${code}`)
        .digest("hex");

async function partnerId() {
    const client = await createClient();
    const {
        data: { user },
    } = await client.auth.getUser();
    return user?.id ?? null;
}

export async function requestPartnerPhoneCode(raw: string): Promise<Result> {
    if (typeof raw !== "string") return failure;
    const phone = normalizePhone(raw);
    if (!isValidPhone(phone))
        return {
            ok: false,
            message: "010으로 시작하는 휴대폰 번호를 입력해 주세요.",
        };
    const id = await partnerId();
    if (!id) return { ok: false, message: "로그인이 필요합니다." };
    // 실제 이메일 발송 설정이 없으면 성공으로 안내하거나 인증번호를 노출하지 않는다.
    if (!process.env.RESEND_API_KEY?.trim()) return failure;
    const code = String(randomInt(100000, 1000000));
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("request_partner_phone_change", {
        p_partner: id,
        p_phone: phone,
        p_hash: digest(id, phone, code),
    });
    if (error || !data) return failure;
    if (!data.ok) return { ok: false, message: data.message };
    try {
        await getEmailSender().send(
            data.email,
            "[함께가요] 파트너 연락처 변경 인증",
            `<p>파트너 프로필의 연락처 변경 화면에 아래 인증번호를 입력해 주세요.</p><p><strong>${code}</strong></p><p>5분간 유효하며 휴대폰 소유 인증이 아닙니다. 요청하지 않았다면 무시해 주세요.</p>`,
        );
    } catch {
        await admin
            .from("partner_phone_changes")
            .update({ consumed_at: new Date().toISOString() })
            .eq("id", data.id)
            .eq("partner_id", id);
        return failure;
    }
    return { ok: true, id: data.id };
}

export async function verifyPartnerPhoneCode(
    requestId: string,
    raw: string,
    code: string,
): Promise<Result> {
    if (
        typeof raw !== "string" ||
        typeof code !== "string" ||
        !/^\d{6}$/.test(code) ||
        !/^[\da-f-]{36}$/i.test(requestId)
    )
        return failure;
    const phone = normalizePhone(raw);
    if (!isValidPhone(phone)) return failure;
    const id = await partnerId();
    if (!id) return { ok: false, message: "로그인이 필요합니다." };
    const { data, error } = await createAdminClient().rpc(
        "verify_partner_phone_change",
        {
            p_partner: id,
            p_id: requestId,
            p_phone: phone,
            p_hash: digest(id, phone, code),
        },
    );
    if (error || !data) return failure;
    if (!data.ok) return { ok: false, message: data.message };
    revalidatePath("/partner/profile");
    return { ok: true };
}

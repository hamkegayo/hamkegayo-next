"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function reviewQualification(input: {
    id: string;
    expected: "PENDING" | "VERIFIED";
    status: "PENDING" | "VERIFIED";
    reason: string;
}) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_review_qualification", {
        p_id: input.id,
        p_expected: input.expected,
        p_status: input.status,
        p_reason: input.reason,
    });
    if (error)
        return {
            ok: false,
            message:
                error.code === "P0002"
                    ? "다른 담당자가 처리했거나 삭제된 항목입니다. 새로고침해 주세요."
                    : "심사 권한과 사유(5~500자)를 확인해 주세요.",
        };
    revalidatePath("/admin");
    revalidatePath("/admin/qualifications");
    revalidatePath("/partner/profile");
    return { ok: true, message: "심사 결과를 저장했습니다." };
}

export async function openQualificationFile(id: string, reason: string) {
    const supabase = await createClient();
    const { data: path, error } = await supabase.rpc(
        "admin_get_qualification_file",
        {
            p_id: id,
            p_reason: reason,
        },
    );
    if (error || typeof path !== "string") {
        return {
            ok: false as const,
            message: "열람 권한과 사유(5~500자)를 확인해 주세요.",
        };
    }
    const { data, error: fileError } = await supabase.storage
        .from("partner-qualifications")
        .createSignedUrl(path, 60);
    if (fileError || !data)
        return {
            ok: false as const,
            message: "증빙 파일을 열 수 없습니다. 다시 시도해 주세요.",
        };
    return { ok: true as const, url: data.signedUrl };
}

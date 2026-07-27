"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import type { QualificationView } from "../../_lib/qualifications.server";

const BUCKET = "partner-qualifications";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export type AddQualificationResult =
    | { ok: true; qualification: QualificationView }
    | { ok: false; message: string };

export type SimpleResult = { ok: true } | { ok: false; message: string };

/** 자격 추가 (증빙 파일 업로드 + 메타 저장) */
export async function addQualification(
    formData: FormData,
): Promise<AddQualificationResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const type = (formData.get("type") as string | null)?.trim() ?? "";
    const regNo = (formData.get("regNo") as string | null)?.trim() || null;
    const date = (formData.get("date") as string | null)?.trim() || null;
    const issuer = (formData.get("issuer") as string | null)?.trim() || null;
    const file = formData.get("file");

    if (!type) return { ok: false, message: "자격 종류를 선택해 주세요." };
    if (!(file instanceof File)) {
        return { ok: false, message: "증빙 파일을 첨부해 주세요." };
    }
    if (file.size > MAX_SIZE) {
        return {
            ok: false,
            message: "파일은 최대 5MB까지 업로드할 수 있습니다.",
        };
    }
    if (!ALLOWED.includes(file.type)) {
        return {
            ok: false,
            message: "JPG, PNG, PDF 파일만 업로드할 수 있습니다.",
        };
    }

    const safeName = file.name.replace(/[^\w.\-가-힣]/g, "_");
    const path = `${user.id}/${crypto.randomUUID()}_${safeName}`;

    const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });
    if (upErr) {
        return {
            ok: false,
            message: "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    const { data, error } = await supabase
        .from("partner_qualifications")
        .insert({
            partner_id: user.id,
            type,
            reg_no: regNo,
            acquired_date: date,
            issuer,
            path,
            filename: file.name,
            size: file.size,
        })
        .select("id, type, reg_no, acquired_date, issuer, filename, status")
        .single();

    if (error || !data) {
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, message: "자격 저장에 실패했습니다." };
    }

    revalidatePath("/partner/profile");
    return {
        ok: true,
        qualification: {
            id: data.id,
            icon: "license",
            title: data.type,
            detail: [
                data.reg_no && `등록번호 ${data.reg_no}`,
                data.acquired_date && `취득일 ${data.acquired_date}`,
                data.issuer,
            ]
                .filter(Boolean)
                .join("    "),
            filename: data.filename,
            pending: data.status === "PENDING",
        },
    };
}

/** 자격 삭제 (Storage 파일 + 메타) */
export async function deleteQualification(id: string): Promise<SimpleResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { data: row } = await supabase
        .from("partner_qualifications")
        .select("id, path")
        .eq("id", id)
        .maybeSingle();
    if (!row) return { ok: false, message: "자격을 찾을 수 없습니다." };

    await supabase.storage.from(BUCKET).remove([row.path]);
    const { error } = await supabase
        .from("partner_qualifications")
        .delete()
        .eq("id", id);
    if (error) return { ok: false, message: "삭제에 실패했습니다." };

    revalidatePath("/partner/profile");
    return { ok: true };
}

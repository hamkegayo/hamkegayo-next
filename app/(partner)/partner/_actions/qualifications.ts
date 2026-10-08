"use server";

import { revalidatePath } from "next/cache";
import {
    getPartnerQualifications,
    toQualificationView,
    type QualificationRow,
    type QualificationView,
} from "../../_lib/qualifications.server";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

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
        .single<QualificationRow>();

    if (error || !data) {
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, message: "자격 저장에 실패했습니다." };
    }

    revalidatePath("/partner/profile");
    return { ok: true, qualification: toQualificationView(data) };
}

/**
 * 미심사 등록 취소. 심사·통지된 자료는 DB가 막는다(보유기간·이의신청 처리).
 * DB가 대기열에 넣은 경로를 바로 지우고, 실패하면 정리 크론이 다시 지운다.
 */
export async function withdrawPartnerEvidence(
    id: string,
    kind: "QUALIFICATION" | "HISTORY",
): Promise<SimpleResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { data, error } = await supabase.rpc("withdraw_partner_evidence", {
        p_id: id,
        p_kind: kind,
    });
    if (error)
        return {
            ok: false,
            message: error.message.includes("evidence_retention_required")
                ? "심사·통지된 증빙은 직접 삭제할 수 없습니다. 보유기간·이의신청 메뉴 또는 고객센터로 수정·삭제를 요청해 주세요."
                : error.message.includes("not_found")
                  ? "등록 내역을 찾을 수 없습니다. 새로고침해 주세요."
                  : "삭제하지 못했습니다. 다시 시도해 주세요.",
        };

    // 대기열 경로는 소유자 열람 정책에서 빠지므로 서비스 권한으로 지운다.
    // RPC가 본인 등록의 경로만 돌려주며, 실패해도 정리 크론이 같은 대기열을 다시 처리한다.
    const paths = ((data as string[] | null) ?? []).filter((p) =>
        p.startsWith(`${user.id}/`),
    );
    if (paths.length) {
        try {
            const admin = createAdminClient();
            const removed = await admin.storage.from(BUCKET).remove(paths);
            if (!removed.error)
                await admin
                    .from("partner_evidence_deletions")
                    .delete()
                    .in("path", paths);
        } catch {
            // 크론이 다시 지운다.
        }
    }

    revalidatePath("/partner/profile");
    revalidatePath("/admin/qualifications");
    return { ok: true };
}

export async function deleteQualification(id: string): Promise<SimpleResult> {
    return withdrawPartnerEvidence(id, "QUALIFICATION");
}

/** 등록 후 목록만 갱신한다. 다른 미저장 프로필 입력은 유지한다. */
export async function getMyQualifications() {
    return getPartnerQualifications();
}

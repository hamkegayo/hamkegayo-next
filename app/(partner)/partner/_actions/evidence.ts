"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
    evidenceFileType,
    EVIDENCE_MAX_FILES,
    EVIDENCE_MAX_SIZE,
    type EvidenceUpload,
} from "@/lib/partner-evidence";

export async function submitPartnerEvidence(
    kind: string,
    input: Record<string, string | boolean>,
    uploads: EvidenceUpload[],
) {
    const client = await createClient();
    const {
        data: { user },
    } = await client.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };
    const { data: enabled } = await client.rpc("partner_evidence_enabled");
    if (enabled !== true)
        return {
            ok: false,
            message: "새 증빙 등록은 수집 고지 확인 후 제공됩니다.",
        };
    if (
        !Array.isArray(uploads) ||
        uploads.length < 1 ||
        uploads.length > EVIDENCE_MAX_FILES
    )
        return { ok: false, message: "증빙은 1~5개 첨부해 주세요." };
    const files = [];
    for (const upload of uploads) {
        if (
            !upload ||
            typeof upload.path !== "string" ||
            !upload.path.startsWith(`${user.id}/evidence/`) ||
            typeof upload.filename !== "string" ||
            upload.filename.length > 200
        )
            return { ok: false, message: "첨부 경로가 올바르지 않습니다." };
        const { data, error } = await client.storage
            .from("partner-qualifications")
            .download(upload.path);
        if (
            error ||
            !data ||
            data.size < 1 ||
            data.size > EVIDENCE_MAX_SIZE ||
            !evidenceFileType(new Uint8Array(await data.arrayBuffer()))
        )
            return {
                ok: false,
                message: "JPG·PNG·PDF, 파일당 최대 5MB만 허용됩니다.",
            };
        files.push({ ...upload, size: data.size });
    }
    const { error } = await createAdminClient().rpc("submit_partner_evidence", {
        p_partner: user.id,
        p_kind: kind,
        p_input: input,
        p_files: files,
    });
    if (error)
        return {
            ok: false,
            message:
                "필수 항목·날짜·등록 상한을 확인해 주세요. 저장에 실패했습니다.",
        };
    revalidatePath("/partner/profile");
    revalidatePath("/admin/qualifications");
    return { ok: true };
}

export async function openPartnerEvidence(
    id: string,
    kind: "QUALIFICATION" | "HISTORY",
    reason: string,
) {
    const client = await createClient();
    const { data, error } = await client.rpc("open_partner_evidence", {
        p_id: id,
        p_kind: kind,
        p_reason: reason,
    });
    if (error || !data)
        return {
            ok: false as const,
            message: "열람 권한과 사유(관리자 5~500자)를 확인해 주세요.",
        };
    const links = [];
    for (const file of data as { path: string; filename: string }[]) {
        const result = await client.storage
            .from("partner-qualifications")
            .createSignedUrl(file.path, 300);
        if (result.error || !result.data)
            return {
                ok: false as const,
                message: "파일을 열 수 없습니다. 다시 확인해 주세요.",
            };
        links.push({ filename: file.filename, url: result.data.signedUrl });
    }
    return { ok: true as const, links };
}

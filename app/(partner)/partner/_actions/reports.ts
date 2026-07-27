"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createNotification } from "@/lib/notifications";

const BUCKET = "report-attachments";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export type ReportInput = {
    meetTime: string;
    endTime: string;
    supports: string[];
    exam: string;
    guardianNote: string;
};

export type SaveReportResult =
    { ok: true; reportId: string } | { ok: false; message: string };

export type UploadResult =
    | {
          ok: true;
          attachment: {
              id: string;
              kind: string;
              filename: string;
              size: number;
          };
      }
    | { ok: false; message: string };

export type SimpleResult = { ok: true } | { ok: false; message: string };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** 서비스 소유·완료 검증 후 서비스 행 반환 */
async function verifyService(
    supabase: SupabaseClient,
    serviceId: string,
    uid: string,
) {
    const { data } = await supabase
        .from("services")
        .select("id")
        .eq("id", serviceId)
        .eq("partner_id", uid)
        .eq("status", "COMPLETED")
        .maybeSingle();
    return data;
}

/** 서비스의 리포트 행을 가져오거나(없으면) DRAFT 로 생성 */
async function ensureReport(
    supabase: SupabaseClient,
    serviceId: string,
    uid: string,
): Promise<string | null> {
    const { data: existing } = await supabase
        .from("reports")
        .select("id")
        .eq("service_id", serviceId)
        .maybeSingle();
    if (existing) return existing.id;

    const { data: created, error } = await supabase
        .from("reports")
        .insert({ service_id: serviceId, partner_id: uid, status: "DRAFT" })
        .select("id")
        .single();
    if (error || !created) return null;
    return created.id;
}

/** 리포트 저장 (임시저장=DRAFT / 제출=SUBMITTED) */
export async function saveReport(
    serviceId: string,
    input: ReportInput,
    submit: boolean,
): Promise<SaveReportResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const service = await verifyService(supabase, serviceId, user.id);
    if (!service) return { ok: false, message: "완료된 서비스가 아닙니다." };

    const row = {
        service_id: serviceId,
        partner_id: user.id,
        status: submit ? "SUBMITTED" : "DRAFT",
        meet_time: input.meetTime || null,
        end_time: input.endTime || null,
        supports: input.supports,
        exam: input.exam || null,
        guardian_note: input.guardianNote || null,
        submitted_at: submit ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
        .from("reports")
        .upsert(row, { onConflict: "service_id" })
        .select("id")
        .single();

    if (error || !data) {
        return {
            ok: false,
            message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    // 제출(SUBMITTED) 시 고객에게 리포트 도착 알림
    if (submit) {
        const { data: svc } = await supabase
            .from("services")
            .select("reservations!inner(customer_id)")
            .eq("id", serviceId)
            .maybeSingle<{ reservations: { customer_id: string } | null }>();
        const customerId = svc?.reservations?.customer_id;
        if (customerId) {
            await createNotification(customerId, {
                type: "REPORT_READY",
                title: "보호자 리포트가 도착했어요",
                body: "완료된 동행의 보호자 리포트를 확인해 주세요.",
                link: "/mypage",
            });
        }
    }

    revalidatePath("/partner/reports");
    revalidatePath(`/partner/reports/${serviceId}`);
    return { ok: true, reportId: data.id };
}

/** 첨부 업로드 (필요 시 DRAFT 리포트 자동 생성) */
export async function uploadReportAttachment(
    serviceId: string,
    formData: FormData,
): Promise<UploadResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const service = await verifyService(supabase, serviceId, user.id);
    if (!service) return { ok: false, message: "완료된 서비스가 아닙니다." };

    const file = formData.get("file");
    const kind = (formData.get("kind") as string | null)?.trim() || "첨부";
    if (!(file instanceof File)) {
        return { ok: false, message: "파일이 없습니다." };
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

    const reportId = await ensureReport(supabase, serviceId, user.id);
    if (!reportId) {
        return { ok: false, message: "리포트를 준비하지 못했습니다." };
    }

    const safeName = file.name.replace(/[^\w.\-가-힣]/g, "_");
    const path = `${user.id}/${serviceId}/${crypto.randomUUID()}_${safeName}`;

    const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });
    if (upErr) {
        return {
            ok: false,
            message: "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    const { data: att, error: insErr } = await supabase
        .from("report_attachments")
        .insert({
            report_id: reportId,
            kind,
            path,
            filename: file.name,
            size: file.size,
        })
        .select("id, kind, filename, size")
        .single();

    if (insErr || !att) {
        // 메타 저장 실패 시 업로드한 파일 정리
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, message: "첨부 저장에 실패했습니다." };
    }

    revalidatePath(`/partner/reports/${serviceId}`);
    return {
        ok: true,
        attachment: {
            id: att.id,
            kind: att.kind,
            filename: att.filename,
            size: att.size,
        },
    };
}

/** 첨부 삭제 (Storage 파일 + 메타) */
export async function deleteReportAttachment(
    attachmentId: string,
): Promise<SimpleResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    // RLS(소유 리포트 파트너)로 접근 제한됨
    const { data: att } = await supabase
        .from("report_attachments")
        .select("id, path")
        .eq("id", attachmentId)
        .maybeSingle();
    if (!att) return { ok: false, message: "첨부를 찾을 수 없습니다." };

    await supabase.storage.from(BUCKET).remove([att.path]);
    const { error } = await supabase
        .from("report_attachments")
        .delete()
        .eq("id", attachmentId);
    if (error) return { ok: false, message: "삭제에 실패했습니다." };

    return { ok: true };
}

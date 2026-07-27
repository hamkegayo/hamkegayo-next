import { createClient } from "@/utils/supabase/server";
import { planDisplay, type PlanCode } from "@/lib/reservation";

/** 리포트 목록 항목 — 완료된 서비스 기준 */
export type ReportListItem = {
    /** 서비스 id (작성 페이지 이동 키) */
    serviceId: string;
    plan: "Basic" | "Plus";
    hospital: string;
    type: string;
    customerName: string;
    customerAge: string;
    customerGender: string;
    serviceDate: string;
    code: string;
    /** pending=미작성/임시저장, done=제출 완료 */
    status: "pending" | "done";
};

/** 리포트 작성 화면 컨텍스트 */
export type ReportAttachmentView = {
    id: string;
    kind: string;
    filename: string;
    size: number;
};

export type ReportContext = {
    serviceId: string;
    code: string;
    serviceDate: string;
    hospital: string;
    customerName: string;
    customerAge: string;
    customerGender: string;
    partnerName: string;
    report: {
        id: string;
        status: "DRAFT" | "SUBMITTED";
        meetTime: string;
        endTime: string;
        supports: string[];
        exam: string;
        guardianNote: string;
    } | null;
    attachments: ReportAttachmentView[];
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDate(useDate: string): string {
    const [y, mo, d] = useDate.split("-").map((n) => Number(n));
    if (!y || !mo || !d) return useDate;
    const weekday = WEEKDAYS[new Date(y, mo - 1, d).getDay()] ?? "";
    return `${y}.${String(mo).padStart(2, "0")}.${String(d).padStart(2, "0")} (${weekday})`;
}

function ageLabel(birth: string): string {
    const [y, mo, d] = birth.split("-").map((n) => Number(n));
    if (!y) return "";
    const now = new Date();
    let age = now.getFullYear() - y;
    if (
        now.getMonth() + 1 < mo ||
        (now.getMonth() + 1 === mo && now.getDate() < d)
    ) {
        age -= 1;
    }
    return `${age}세`;
}

type ListRow = {
    id: string;
    reservations: {
        code: string;
        plan: string;
        hospital_address: string;
        treatment: string;
        patient_name: string;
        patient_birth: string;
        patient_gender: string;
        use_date: string;
    } | null;
    reports: { status: string }[] | null;
};

/** 완료된 서비스 기준 리포트 목록 (파트너) */
export async function getPartnerReports(): Promise<ReportListItem[]> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from("services")
            .select(
                "id, reservations!inner(code, plan, hospital_address, treatment, patient_name, patient_birth, patient_gender, use_date), reports(status)",
            )
            .eq("partner_id", user.id)
            .eq("status", "COMPLETED")
            .order("created_at", { ascending: false })
            .returns<ListRow[]>();

        if (error || !data) return [];

        return data.map((s) => {
            const res = s.reservations;
            const planCode: PlanCode = res?.plan === "plus" ? "plus" : "basic";
            const submitted = (s.reports ?? []).some(
                (r) => r.status === "SUBMITTED",
            );
            return {
                serviceId: s.id,
                plan: planDisplay(planCode),
                hospital: res?.hospital_address ?? "",
                type: res?.treatment ?? "",
                customerName: res?.patient_name ?? "",
                customerAge: res ? ageLabel(res.patient_birth) : "",
                customerGender:
                    res?.patient_gender === "male" ? "남성" : "여성",
                serviceDate: res ? formatDate(res.use_date) : "",
                code: res?.code ?? "",
                status: submitted ? "done" : "pending",
            };
        });
    } catch {
        return [];
    }
}

/**
 * 리포트 작성 뱃지용 카운트 — 완료된 서비스 중 아직 제출되지 않은 리포트 수.
 * 목록과 동일 기준(getPartnerReports)을 재사용한다.
 */
export async function getPartnerPendingReportCount(): Promise<number> {
    const list = await getPartnerReports();
    return list.filter((r) => r.status === "pending").length;
}

type ContextRow = {
    id: string;
    partner_id: string;
    reservations: {
        code: string;
        hospital_address: string;
        treatment: string;
        patient_name: string;
        patient_birth: string;
        patient_gender: string;
        use_date: string;
    } | null;
    reports:
        | {
              id: string;
              status: string;
              meet_time: string | null;
              end_time: string | null;
              supports: string[] | null;
              exam: string | null;
              guardian_note: string | null;
          }[]
        | null;
};

/** 리포트 작성 컨텍스트 (서비스 + 기존 리포트/첨부) */
export async function getReportContext(
    serviceId: string,
): Promise<ReportContext | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from("services")
            .select(
                "id, partner_id, reservations!inner(code, hospital_address, treatment, patient_name, patient_birth, patient_gender, use_date), reports(id, status, meet_time, end_time, supports, exam, guardian_note)",
            )
            .eq("id", serviceId)
            .eq("partner_id", user.id)
            .eq("status", "COMPLETED")
            .maybeSingle<ContextRow>();

        if (error || !data) return null;

        const res = data.reservations;
        const report = (data.reports ?? [])[0] ?? null;

        // 파트너 본인 이름
        const { data: prof } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .maybeSingle();

        // 첨부 목록 (리포트가 있을 때)
        let attachments: ReportAttachmentView[] = [];
        if (report) {
            const { data: atts } = await supabase
                .from("report_attachments")
                .select("id, kind, filename, size")
                .eq("report_id", report.id)
                .order("created_at", { ascending: true });
            attachments = (atts ?? []).map((a) => ({
                id: a.id,
                kind: a.kind,
                filename: a.filename,
                size: a.size,
            }));
        }

        return {
            serviceId: data.id,
            code: res?.code ?? "",
            serviceDate: res ? formatDate(res.use_date) : "",
            hospital: res?.hospital_address ?? "",
            customerName: res?.patient_name ?? "",
            customerAge: res ? ageLabel(res.patient_birth) : "",
            customerGender: res?.patient_gender === "male" ? "남성" : "여성",
            partnerName: prof?.name ? `${prof.name} 파트너` : "파트너",
            report: report
                ? {
                      id: report.id,
                      status:
                          report.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
                      meetTime: report.meet_time ?? "",
                      endTime: report.end_time ?? "",
                      supports: report.supports ?? [],
                      exam: report.exam ?? "",
                      guardianNote: report.guardian_note ?? "",
                  }
                : null,
            attachments,
        };
    } catch {
        return null;
    }
}

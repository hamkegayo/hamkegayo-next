import { createClient } from "@/utils/supabase/server";
import { planDisplay, type PlanCode } from "@/lib/reservation";
import { kstTime } from "@/lib/format";

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

/**
 * 리포트에 싣는 수행 시각 한 줄.
 *
 *  값은 전부 services 에 서버가 찍어 둔 것이다. 리포트가 따로 갖고 있지
 *  않는다 — 두 곳에 두면 어긋나고, 어긋나면 어느 쪽이 맞는지 판단할 근거가
 *  없다(#55, 마이그레이션 41).
 */
export type ReportTimeRow = {
    label: string;
    /** "HH:mm" */
    value: string;
    /** 청구 구간의 시작·끝. 분쟁 시 먼저 보는 두 줄이다. */
    billing?: boolean;
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
    /** 기록된 시각만 순서대로. 누르지 않은 단계는 아예 나오지 않는다. */
    times: ReportTimeRow[];
    /** 청구 기준 구간. 기록이 없으면 빈 문자열 */
    timeRange: string;
    /** 파트너가 종료를 누르지 않아 시스템이 마감한 건 */
    autoClosed: boolean;
    /** 이용자 미도착으로 끝난 건 (약관 제15조 ③) */
    noShow: boolean;
    report: {
        id: string;
        status: "DRAFT" | "SUBMITTED";
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
    arrived_at: string | null;
    started_at: string | null;
    ended_at: string | null;
    notified_at: string | null;
    hospital_arrived_at: string | null;
    reception_at: string | null;
    wait_started_at: string | null;
    wait_ended_at: string | null;
    treatment_started_at: string | null;
    treatment_ended_at: string | null;
    checkout_started_at: string | null;
    checkout_ended_at: string | null;
    home_departed_at: string | null;
    handover_at: string | null;
    no_show: boolean | null;
    auto_closed_at: string | null;
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
              supports: string[] | null;
              exam: string | null;
              guardian_note: string | null;
          }[]
        | null;
};

/** ISO → "HH:mm". 값이 없으면 null. */
function toTimeLabel(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return kstTime(d);
}

/**
 * 리포트에 실을 시각 목록.
 *
 *  순서는 매뉴얼 단계 순서다(4 → 7 → 8 → 9 → 11 → 12 → 13). 누르지 않은
 *  단계는 넣지 않는다 — 빈 줄을 채워 두면 "기록이 있는데 비어 있다" 로
 *  읽힌다. 시작·종료 두 줄만 청구 구간으로 표시한다.
 */
function buildTimes(r: ContextRow): ReportTimeRow[] {
    const rows: [string, string | null, boolean?][] = [
        ["파트너 도착", r.arrived_at],
        ["도착 통보", r.notified_at],
        ["서비스 시작", r.started_at, true],
        ["병원 도착", r.hospital_arrived_at],
        ["접수 완료", r.reception_at],
        ["대기 시작", r.wait_started_at],
        ["대기 종료", r.wait_ended_at],
        ["진료·검사 시작", r.treatment_started_at],
        ["진료·검사 종료", r.treatment_ended_at],
        ["수납·약국 시작", r.checkout_started_at],
        ["수납·약국 종료", r.checkout_ended_at],
        ["귀가 출발", r.home_departed_at],
        ["인계 확인", r.handover_at],
        ["서비스 종료", r.ended_at, true],
    ];

    const out: ReportTimeRow[] = [];
    for (const [label, iso, billing] of rows) {
        const value = toTimeLabel(iso);
        if (!value) continue;
        out.push(billing ? { label, value, billing: true } : { label, value });
    }
    return out;
}

const CONTEXT_SELECT =
    "id, partner_id, arrived_at, started_at, ended_at, " +
    "notified_at, hospital_arrived_at, reception_at, wait_started_at, wait_ended_at, " +
    "treatment_started_at, treatment_ended_at, checkout_started_at, checkout_ended_at, " +
    "home_departed_at, handover_at, no_show, auto_closed_at, " +
    "reservations!inner(code, hospital_address, treatment, patient_name, patient_birth, patient_gender, use_date), " +
    "reports(id, status, supports, exam, guardian_note)";

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
            .select(CONTEXT_SELECT)
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

        const times = buildTimes(data);
        const startLabel = toTimeLabel(data.started_at);
        const endLabel = toTimeLabel(data.ended_at);

        return {
            serviceId: data.id,
            code: res?.code ?? "",
            serviceDate: res ? formatDate(res.use_date) : "",
            hospital: res?.hospital_address ?? "",
            customerName: res?.patient_name ?? "",
            customerAge: res ? ageLabel(res.patient_birth) : "",
            customerGender: res?.patient_gender === "male" ? "남성" : "여성",
            partnerName: prof?.name ? `${prof.name} 파트너` : "파트너",
            times,
            timeRange:
                startLabel && endLabel ? `${startLabel} ~ ${endLabel}` : "",
            autoClosed: data.auto_closed_at != null,
            noShow: data.no_show === true,
            report: report
                ? {
                      id: report.id,
                      status:
                          report.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
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

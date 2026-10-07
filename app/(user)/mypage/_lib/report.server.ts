import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { kstDateTime } from "@/lib/format";

/** 첨부 서명 URL 유효시간(초). 화면을 연 동안만 쓰도록 짧게 둔다. */
const ATTACHMENT_URL_TTL = 300;
const BUCKET = "report-attachments";

export type CustomerReportAttachment = {
    id: string;
    kind: string;
    filename: string;
    size: number;
    /** 서명 URL 발급에 실패하면 null — 목록은 보여 주되 열 수 없다고 안내한다 */
    url: string | null;
};

export type CustomerReport = {
    submittedAtLabel: string | null;
    /** 보유기간(3년)이 지나 본문이 파기됨 — 처리방침 제4조 */
    purged: boolean;
    /** 진료내용 전달 동의 — 없으면 본문·첨부가 오지 않는다(약관 제8조 · 처리방침 제10조 ④) */
    medicalShared: boolean;
    supports: string[];
    guardianNote: string | null;
    exam: string | null;
    attachments: CustomerReportAttachment[];
};

type ReportRow = {
    report_id: string;
    submitted_at: string | null;
    purged: boolean;
    medical_shared: boolean;
    supports: string[];
    guardian_note: string | null;
    exam: string | null;
    attachments: {
        id: string;
        kind: string;
        filename: string;
        size: number;
        path: string;
    }[];
};

/**
 * 고객 본인 예약의 제출된 보호자 리포트 (#253).
 * 권한·동의 범위·파기 판정·접근 기록은 DB 함수 get_own_report 가 한다.
 * 첨부는 그 함수가 내준 경로에 한해 서버에서 짧은 서명 URL 을 만든다.
 */
export async function getOwnReport(
    reservationId: string,
): Promise<CustomerReport | null> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc("get_own_report", {
            p_reservation: reservationId,
        });
        if (error || !data) return null;
        const row = data as ReportRow;

        const urls = new Map<string, string>();
        if (row.attachments.length > 0) {
            const { data: signed } = await createAdminClient()
                .storage.from(BUCKET)
                .createSignedUrls(
                    row.attachments.map((a) => a.path),
                    ATTACHMENT_URL_TTL,
                );
            for (const s of signed ?? []) {
                if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
            }
        }

        return {
            submittedAtLabel: kstDateTime(row.submitted_at),
            purged: row.purged,
            medicalShared: row.medical_shared,
            supports: row.supports ?? [],
            guardianNote: row.guardian_note,
            exam: row.exam,
            attachments: row.attachments.map((a) => ({
                id: a.id,
                kind: a.kind,
                filename: a.filename,
                size: a.size,
                url: urls.get(a.path) ?? null,
            })),
        };
    } catch {
        return null;
    }
}

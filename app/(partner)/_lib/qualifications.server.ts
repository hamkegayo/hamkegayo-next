import { createClient } from "@/utils/supabase/server";

/** 프로필 자격 목록 항목 (QualItem 호환 + filename) */
export type QualificationView = {
    id: string;
    icon: "license";
    title: string;
    detail: string;
    filename: string;
    /** 인증 대기 여부 (PENDING) */
    pending: boolean;
};

type Row = {
    id: string;
    type: string;
    reg_no: string | null;
    acquired_date: string | null;
    issuer: string | null;
    filename: string;
    status: "PENDING" | "VERIFIED";
};

function detailOf(r: Row): string {
    return [
        r.reg_no && `등록번호 ${r.reg_no}`,
        r.acquired_date && `취득일 ${r.acquired_date}`,
        r.issuer,
    ]
        .filter(Boolean)
        .join("    ");
}

/** 로그인 파트너의 자격/보유 사항 목록 */
export async function getPartnerQualifications(): Promise<QualificationView[]> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from("partner_qualifications")
            .select("id, type, reg_no, acquired_date, issuer, filename, status")
            .eq("partner_id", user.id)
            .order("created_at", { ascending: false })
            .returns<Row[]>();

        if (error || !data) return [];

        return data.map((r) => ({
            id: r.id,
            icon: "license" as const,
            title: r.type,
            detail: detailOf(r),
            filename: r.filename,
            pending: r.status === "PENDING",
        }));
    } catch {
        return [];
    }
}

import { createClient } from "@/utils/supabase/server";

/** 프로필 자격 목록 항목 (QualItem 호환 + filename) */
export type QualificationView = {
    id: string;
    icon: "license";
    title: string;
    detail: string;
    regNo: string | null;
    acquiredDate: string | null;
    issuer: string | null;
    filename: string | null;
    /** 인증 대기 여부 (PENDING) */
    pending: boolean;
};

export type QualificationRow = {
    id: string;
    type: string;
    reg_no: string | null;
    acquired_date: string | null;
    issuer: string | null;
    filename: string | null;
    status: "PENDING" | "VERIFIED";
};

function detailOf(r: QualificationRow): string {
    return [
        r.reg_no && `등록번호 ${r.reg_no}`,
        r.acquired_date && `취득일 ${r.acquired_date}`,
        r.issuer && `발급기관 ${r.issuer}`,
    ]
        .filter(Boolean)
        .join("    ");
}

export function toQualificationView(r: QualificationRow): QualificationView {
    return {
        id: r.id,
        icon: "license",
        title: r.type,
        detail: detailOf(r),
        regNo: r.reg_no,
        acquiredDate: r.acquired_date,
        issuer: r.issuer,
        filename: r.filename,
        pending: r.status === "PENDING",
    };
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
            .returns<QualificationRow[]>();

        if (error || !data) return [];

        return data.map(toQualificationView);
    } catch {
        return [];
    }
}

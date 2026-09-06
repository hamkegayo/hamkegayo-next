import { createClient } from "@/utils/supabase/server";
import { koreanAgeLabel } from "@/lib/format";

export type CareRecipient = {
    id: string;
    name: string;
    relation: string;
    gender: "male" | "female" | "";
    genderLabel: string;
    /** "YYYY-MM-DD" (편집용) */
    birth: string;
    /** "N세" (표시용, birth 없으면 "") */
    ageLabel: string;
    phone: string;
};

type Row = {
    id: string;
    name: string;
    relation: string | null;
    gender: string | null;
    birth: string | null;
    phone: string | null;
};

/** birth("YYYY-MM-DD") → "N세" (만 나이 · KST 기준) */
function ageLabel(birth: string | null): string {
    return koreanAgeLabel(birth);
}

function toView(r: Row): CareRecipient {
    const gender =
        r.gender === "male" ? "male" : r.gender === "female" ? "female" : "";
    return {
        id: r.id,
        name: r.name,
        relation: r.relation ?? "",
        gender,
        genderLabel:
            gender === "male" ? "남성" : gender === "female" ? "여성" : "",
        birth: r.birth ?? "",
        ageLabel: ageLabel(r.birth),
        phone: r.phone ?? "",
    };
}

/** 로그인 회원의 보호 대상(환자) 목록 — 최신순 */
export async function getCareRecipients(): Promise<CareRecipient[]> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from("care_recipients")
            .select("id, name, relation, gender, birth, phone")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .returns<Row[]>();

        if (error || !data) return [];
        return data.map(toView);
    } catch {
        return [];
    }
}

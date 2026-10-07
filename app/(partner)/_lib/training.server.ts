import { createClient } from "@/utils/supabase/server";

/** 매뉴얼 10장의 교육 3종 (DB partner_trainings.course 와 같은 값) */
export const TRAINING_COURSES = [
    { code: "BASIC", label: "기본 업무교육" },
    { code: "EMERGENCY", label: "응급상황 대응교육" },
    { code: "PRIVACY", label: "개인정보 보호교육" },
] as const;

export type TrainingCourse = (typeof TRAINING_COURSES)[number]["code"];

export type MyTrainingStatus = {
    /**
     * 미이수 시 요청 수락 차단이 켜졌는지 (partner_training_enforcement).
     * null = 조회 실패. 꺼짐으로 보이면 차단 안내가 숨겨지므로 따로 구분한다 (#267 리뷰).
     */
    required: boolean | null;
    completed: Partial<Record<TrainingCourse, string>>;
};

/** 로그인 파트너 본인의 교육 이수 확인 기록 (#255-3) */
export async function getMyTrainingStatus(): Promise<MyTrainingStatus | null> {
    try {
        const supabase = await createClient();
        const [rows, required] = await Promise.all([
            supabase.from("partner_trainings").select("course, completed_on"),
            supabase.rpc("partner_training_required"),
        ]);
        if (rows.error) return null;
        const completed: MyTrainingStatus["completed"] = {};
        for (const r of rows.data ?? []) {
            completed[r.course as TrainingCourse] = r.completed_on;
        }
        return {
            required: required.error ? null : required.data === true,
            completed,
        };
    } catch {
        return null;
    }
}

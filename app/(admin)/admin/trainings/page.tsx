import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { TrainingRow, type CourseRecord } from "./training-row";

type Row = {
    partner_id: string;
    name: string | null;
    login_id: string;
    account_status: string;
    courses: Record<string, CourseRecord>;
};

/**
 * 파트너 교육 이수 확인 (#255-3). 심사 권한 + 2단계 인증.
 * 매뉴얼 10장 — 첫 업무 수락 전에 기본 업무·응급상황 대응·개인정보 보호교육 이수를 확인한다.
 * 수락 차단 스위치(partner_training_enforcement)를 켜기 전에 기존 파트너 기록을 먼저 입력한다.
 */
export default async function TrainingsPage() {
    const supabase = await createClient();
    const [list, required] = await Promise.all([
        supabase.rpc("admin_list_partner_trainings"),
        supabase.rpc("partner_training_required"),
    ]);
    if (list.error)
        return (
            <p role="alert">
                심사 담당 권한과 2단계 인증이 필요합니다. 관리자에게 문의해
                주세요.
            </p>
        );
    const rows = (list.data ?? []) as Row[];
    const complete = rows.filter(
        (r) => Object.keys(r.courses ?? {}).length === 3,
    ).length;

    return (
        <div>
            <Link href="/admin" className="text-brand text-sm underline">
                관리자 홈
            </Link>
            <h1 className="mt-4 text-2xl font-bold">파트너 교육 이수 확인</h1>
            <p className="text-description-foreground mt-2 text-sm break-keep">
                기본 업무교육·응급상황 대응교육·개인정보 보호교육 이수를 증빙과
                대조한 뒤 기록해 주세요. 기록과 삭제는 접근 기록에 남습니다.
            </p>
            <p className="mt-3 text-sm font-semibold">
                3종 이수 {complete}명 / 전체 {rows.length}명 · 미이수 수락 차단{" "}
                {required.error
                    ? "확인 실패 — 새로고침해 주세요"
                    : required.data === true
                      ? "켜짐"
                      : "꺼짐(기록 입력 기간)"}
            </p>
            <ul className="mt-6 space-y-4">
                {rows.map((r) => (
                    <li
                        key={r.partner_id}
                        className="bg-background rounded-xl border p-5"
                    >
                        <h2 className="font-bold">
                            {r.name ?? "(이름 없음)"}{" "}
                            <span className="text-muted-foreground text-sm font-normal">
                                {r.login_id}
                                {r.account_status !== "ACTIVE"
                                    ? ` · ${r.account_status}`
                                    : ""}
                            </span>
                        </h2>
                        <TrainingRow
                            partnerId={r.partner_id}
                            courses={r.courses ?? {}}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

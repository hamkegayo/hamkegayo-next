import Link from "next/link";

import { KAKAO_UNLINK_LABEL } from "@/lib/auth/kakao-unlink-alert.server";
import type { KakaoUnlinkReferrer } from "@/lib/auth/kakao-unlink";
import { kstDateTime } from "@/lib/format";
import { createClient } from "@/utils/supabase/server";

import { ResolveForm } from "./resolve-form";

type Row = {
    id: string;
    referrer_type: string;
    status: string;
    user_id: string | null;
    member_name: string | null;
    member_email: string | null;
    member_status: string | null;
    memo: string | null;
    received_at: string;
    resolved_at: string | null;
};

/**
 * 카카오 연결 해제 알림 (#291). 기록과 확인만 한다. 회원 데이터는 자동으로 바꾸지 않는다.
 * 연결 해제 건을 어떻게 처리할지(회원 의사 확인·탈퇴 등)는 결정 대기 중이라 확정된 절차처럼
 * 안내하지 않는다(#292 리뷰). 목록은 한 번 호출하고 접속기록 1건을 남긴다.
 */
export default async function SocialUnlinksPage() {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_list_social_unlinks");
    if (error)
        return (
            <p role="alert">
                관리자 권한과 2단계 인증이 필요합니다. 목록을 불러오지
                못했습니다.
            </p>
        );
    const rows = (data ?? []) as Row[];
    // RPC 가 미처리는 오래된 순, 처리 완료는 최근 처리 순(20건)으로 준다.
    const openRows = rows.filter((row) => row.status === "OPEN");
    const resolvedRows = rows.filter((row) => row.status === "RESOLVED");
    const label = (type: string) =>
        KAKAO_UNLINK_LABEL[type as KakaoUnlinkReferrer] ?? type;

    return (
        <div>
            <Link href="/admin" className="text-brand text-sm underline">
                관리자 홈
            </Link>
            <h1 className="mt-4 text-2xl font-bold">카카오 연결 해제</h1>
            <p className="text-description-foreground mt-2 text-sm leading-relaxed break-keep">
                사용자가 카카오 쪽에서 서비스 연결을 끊거나 카카오계정을
                탈퇴하면 기록됩니다. 회원 데이터는 자동으로 바꾸지 않았습니다.
                회원을 확인하고 운영 기준에 따라 조치한 뒤 처리 완료로 표시해
                주세요. 미처리 건은 오래된 순으로 보입니다.
            </p>

            <h2 className="mt-8 text-lg font-bold">미처리</h2>
            {openRows.length === 0 ? (
                <p className="mt-3 leading-relaxed">미처리 건이 없습니다.</p>
            ) : (
                <ul className="mt-3 space-y-4">
                    {openRows.map((row) => (
                        <li
                            key={row.id}
                            className="bg-background rounded-xl border p-5"
                        >
                            <h3 className="font-bold">
                                {label(row.referrer_type)}
                            </h3>
                            <p className="text-description-foreground mt-1 text-sm leading-relaxed">
                                수신 {kstDateTime(row.received_at)}
                            </p>
                            <p className="mt-2 text-sm leading-relaxed">
                                {row.user_id
                                    ? `회원 ${row.member_name ?? "(프로필 없음)"} · ${row.member_email ?? "-"} · 상태 ${row.member_status ?? "-"}`
                                    : "연결된 회원이 없습니다(가입 미완료이거나 이미 정리된 계정)."}
                            </p>
                            <ResolveForm id={row.id} />
                        </li>
                    ))}
                </ul>
            )}

            <h2 className="mt-10 text-lg font-bold">최근 처리 완료</h2>
            {resolvedRows.length === 0 ? (
                <p className="mt-3 leading-relaxed">처리한 건이 없습니다.</p>
            ) : (
                <ul className="divide-border mt-3 divide-y text-sm">
                    {resolvedRows.map((row) => (
                        <li key={row.id} className="py-3">
                            <p className="font-semibold">
                                {label(row.referrer_type)} ·{" "}
                                {row.member_name ?? "회원 없음"}
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                                처리 {kstDateTime(row.resolved_at ?? "")} ·{" "}
                                {row.memo}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

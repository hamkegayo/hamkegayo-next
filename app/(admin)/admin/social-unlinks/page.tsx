import Link from "next/link";

import { KAKAO_UNLINK_LABEL } from "@/lib/auth/kakao-unlink-alert.server";
import type { KakaoUnlinkReferrer } from "@/lib/auth/kakao-unlink";
import { kstDateTime } from "@/lib/format";
import { createClient } from "@/utils/supabase/server";

import { ResolveForm } from "./resolve-form";

type Row = {
    id: string;
    referrer_type: string;
    user_id: string | null;
    member_name: string | null;
    member_email: string | null;
    member_status: string | null;
    received_at: string;
};

/**
 * 카카오 연결 해제 알림 (#291). 기록과 확인만 한다. 회원 데이터는 자동으로 바꾸지 않는다.
 * 처리 기준(2026-10-23 결정 A): 고객문의 채널로 회원의 탈퇴 의사를 확인한 뒤 처리한다
 * (개인정보처리방침 제12조 ③). 처리 완료하면 기록은 지체 없이 파기되고(제11조 ①)
 * 처리 메모는 접속기록에만 남는다. 목록은 한 번 호출하고 접속기록 1건을 남긴다.
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
                탈퇴하면 기록됩니다. 연결 해제만으로 탈퇴를 요청한 것으로 보지
                않으며, 회원 데이터는 자동으로 바꾸지 않았습니다.
            </p>
            <ol className="text-description-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed break-keep">
                <li>
                    고객문의 채널(이메일·카카오톡)로 회원에게 연락해 탈퇴 의사를
                    확인합니다.
                </li>
                <li>
                    탈퇴를 원하면 서비스 안의 회원탈퇴 기능을 안내합니다.
                    카카오계정 탈퇴 등으로 로그인할 수 없는 회원이 탈퇴를
                    요청하면 개발 담당에게 처리를 요청합니다.
                </li>
                <li>
                    확인을 마치면 결과를 메모로 남기고 처리 완료합니다. 기록은
                    바로 파기되고 메모는 접속기록에만 남습니다.
                </li>
            </ol>

            <h2 className="mt-8 text-lg font-bold">미처리 (오래된 순)</h2>
            {rows.length === 0 ? (
                <p className="mt-3 leading-relaxed">미처리 건이 없습니다.</p>
            ) : (
                <ul className="mt-3 space-y-4">
                    {rows.map((row) => (
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
                                    : "연결된 회원이 없습니다. 가입을 마치지 않았거나, 이미 탈퇴해 소셜 연결이 정리된 회원입니다(탈퇴 회원은 따로 조치할 것이 없습니다)."}
                            </p>
                            <ResolveForm id={row.id} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

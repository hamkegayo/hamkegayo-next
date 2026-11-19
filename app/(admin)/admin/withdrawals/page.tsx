import Link from "next/link";

import { createClient } from "@/utils/supabase/server";

import { WithdrawalSearchConsole } from "./withdrawal-search-console";

/**
 * 고객문의로 받은 회원탈퇴 요청의 운영자 처리 (#293).
 * 카카오계정 탈퇴 등으로 로그인할 수 없는 회원이 고객문의 채널로 탈퇴를 요청한 경우에 쓴다
 * (개인정보처리방침 제12조 ③). 대상은 이메일·휴대전화번호·회원 UUID 정확 일치로만 찾는다(제13조).
 * 권한은 모든 활성 관리자(2단계 인증 완료, 담당 구분 없음, is_admin_live)다.
 * admin_accounts.duty = '전체' 를 뜻하지 않는다. 비밀번호 변경이 남은 관리자는 제외된다.
 */
export default async function AdminWithdrawalsPage() {
    const supabase = await createClient();
    const { data: allowed, error } = await supabase.rpc("is_admin_live");
    if (error || allowed !== true)
        return (
            <p role="alert">
                관리자 권한과 2단계 인증이 필요합니다. 화면을 불러오지
                못했습니다.
            </p>
        );

    return (
        <div>
            <div className="flex flex-wrap items-center gap-4">
                <Link href="/admin" className="text-brand text-sm underline">
                    관리자 홈
                </Link>
                <Link
                    href="/admin/social-unlinks"
                    className="text-brand text-sm underline"
                >
                    카카오 연결 해제
                </Link>
            </div>
            <h1 className="mt-4 text-2xl font-bold">운영자 회원 탈퇴</h1>
            <p className="text-description-foreground mt-2 text-sm leading-relaxed break-keep">
                카카오계정 탈퇴 등으로 로그인할 수 없는 회원이 고객문의 채널로
                탈퇴를 요청한 경우에 처리합니다. 로그인할 수 있는 회원에게는
                서비스 안의 회원탈퇴 기능을 안내해 주세요.
            </p>
            <ol className="text-description-foreground mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed break-keep">
                <li>
                    고객문의 채널(이메일·카카오톡)로 회원 본인의 탈퇴 의사를
                    확인한 경우에만 처리할 수 있습니다.
                </li>
                <li>
                    회원과 연락이 닿지 않으면{" "}
                    <strong className="text-foreground">
                        탈퇴 처리하지 않고 계정을 유지
                    </strong>
                    합니다.
                </li>
                <li>
                    탈퇴하면 이름·연락처·이메일은 3년간 분리 보관 후 파기되고,
                    예약·결제·정산 기록은 보존기간 동안 남습니다. 미납
                    추가결제·진행 예정 예약·진행 중 서비스·미지급 정산이 있으면
                    처리되지 않습니다.
                </li>
                <li>
                    조회와 처리는 모두 접속기록에 남습니다. 검색은 이메일 ·
                    휴대전화번호 · 회원 UUID 정확 일치만 됩니다.
                </li>
            </ol>

            <WithdrawalSearchConsole />
        </div>
    );
}

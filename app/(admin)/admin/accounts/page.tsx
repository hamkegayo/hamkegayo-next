import Link from "next/link";

import { createClient } from "@/utils/supabase/server";
import { PartnerAccountForm } from "./partner-account-form";

export default async function AdminAccountsPage() {
    const supabase = await createClient();
    const { data: allowed } = await supabase.rpc("can_issue_accounts");
    if (allowed !== true)
        return <p>계정 담당 권한과 2단계 인증이 필요합니다.</p>;

    return (
        <div>
            <Link href="/admin" className="text-brand text-sm underline">
                관리자 홈
            </Link>
            <h1 className="mt-4 text-2xl font-bold">파트너 계정 발급</h1>
            <p className="text-description-foreground mt-2 text-sm">
                전용 로그인 아이디만 발급합니다. 이름·연락처·비밀번호는 파트너가
                본인 인증 후 직접 등록합니다.
            </p>
            <PartnerAccountForm />
        </div>
    );
}

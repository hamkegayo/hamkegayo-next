import Link from "next/link";

import { createClient } from "@/utils/supabase/server";
import { AdminAccountForm } from "./admin-account-form";
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
            <h1 className="mt-4 text-2xl font-bold">전용 계정 발급</h1>
            <p className="text-description-foreground mt-2 text-sm">
                개인 이용 계정을 승격하지 않고 업무별 전용 계정을 발급합니다.
            </p>
            <AdminAccountForm />
            <PartnerAccountForm />
        </div>
    );
}

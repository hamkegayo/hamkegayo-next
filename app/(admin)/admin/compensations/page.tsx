import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { kstDateTime } from "@/lib/format";
import { CompensationGrantForm, RevokeButton } from "./compensation-console";
import { KIND_LABEL } from "./kinds";

type Row = {
    id: string;
    reservation_id: string | null;
    reservation_code: string;
    customer_name: string | null;
    kind: string;
    amount: number;
    reason: string;
    evidence_ref: string;
    granted_by_name: string | null;
    granted_at: string;
    revoked_amount: number | null;
    revoke_reason: string | null;
    revoked_by_name: string | null;
    revoked_at: string | null;
};

/**
 * 귀책 보상 포인트 지급 (#250). 전체/정산 담당자 + 2단계 인증.
 * 약관 제16조 ⑧(파트너 직전 취소·20분 이상 지각·노쇼), 제19조 ③(귀책 미제공).
 */
export default async function CompensationsPage() {
    const { data, error } = await (
        await createClient()
    ).rpc("admin_list_compensations", { p_limit: 100 });
    if (error)
        return (
            <p role="alert">
                전체/정산 권한 및 MFA 인증이 필요합니다. 조회 실패는 지급 이력이
                없다는 뜻이 아닙니다.
            </p>
        );
    const rows = (data ?? []) as Row[];
    return (
        <section>
            <Link href="/admin" className="text-brand text-sm underline">
                관리자 홈
            </Link>
            <h1 className="mt-4 text-2xl font-bold">귀책 보상 포인트 지급</h1>
            <p className="text-muted-foreground mt-3 text-sm break-keep">
                파트너 직전 취소·20분 이상 지각·노쇼(약관 제16조 ⑧) 또는
                회사·파트너 귀책으로 서비스가 제공되지 않은 경우(제19조 ③)에
                지급합니다. 1회 상한 100,000P, 유효기간 없음. 결제·환불·파트너
                정산 금액은 바뀌지 않습니다. 사유에 의료 상세·계좌 정보를 적지
                마세요.
            </p>

            <CompensationGrantForm />

            <h2 className="mt-10 text-lg font-bold">지급 이력</h2>
            {rows.length === 0 ? (
                <p className="text-muted-foreground mt-3 text-sm">
                    지급 이력이 없습니다.
                </p>
            ) : (
                <ul className="mt-3 space-y-3">
                    {rows.map((r) => (
                        <li key={r.id} className="rounded-lg border p-4">
                            <p className="font-bold">
                                {r.reservation_code} ·{" "}
                                {r.customer_name ?? "탈퇴 회원"} ·{" "}
                                {r.amount.toLocaleString()}P
                            </p>
                            <p className="text-muted-foreground mt-1 text-sm">
                                {KIND_LABEL[r.kind] ?? r.kind} · 증빙{" "}
                                {r.evidence_ref} · {r.granted_by_name ?? "-"} ·{" "}
                                {kstDateTime(r.granted_at)}
                            </p>
                            <p className="mt-1 text-sm break-keep">
                                {r.reason}
                            </p>
                            {r.revoked_at ? (
                                <p className="mt-2 text-sm break-keep text-red-600">
                                    회수 {r.revoked_amount?.toLocaleString()}P
                                    {r.revoked_amount === 0
                                        ? " (이미 사용되어 회수할 잔액 없음)"
                                        : ""}{" "}
                                    · {r.revoked_by_name ?? "-"} ·{" "}
                                    {kstDateTime(r.revoked_at)} ·{" "}
                                    {r.revoke_reason}
                                </p>
                            ) : (
                                <RevokeButton id={r.id} />
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

import { createClient } from "@/utils/supabase/server";
import { RefundControls } from "./refund-controls";
export default async function RefundsPage() {
    const { data, error } = await (
        await createClient()
    ).rpc("admin_refund_queue");
    if (error)
        return (
            <p role="alert">
                전체/정산 권한 및 MFA 인증이 필요합니다. 조회 실패는 대기 건이
                없다는 뜻이 아닙니다.
            </p>
        );
    return (
        <section>
            <h1 className="text-2xl font-bold">종료 후 미달분 환불</h1>
            <p className="mt-3">
                예약 취소와 별개입니다. 파트너 종료 시각과 실제 제공 내용을
                확인해 주세요. 예외 종료는 운영 판단 완료 전 집행하지 않습니다.
            </p>
            <ul className="mt-5 space-y-4">
                {(data ?? []).map(
                    (r: {
                        id: string;
                        code: string;
                        amount: number;
                        status: string;
                        claimed: boolean;
                    }) => (
                        <li key={r.id} className="rounded border p-4">
                            <h2 className="font-bold">
                                {r.code} · {r.amount.toLocaleString()}원 ·{" "}
                                {r.status}
                            </h2>
                            <RefundControls {...r} />
                        </li>
                    ),
                )}
            </ul>
            {!data?.length && (
                <p className="mt-5">대기 중인 환불 요청이 없습니다.</p>
            )}
        </section>
    );
}

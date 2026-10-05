import { createClient } from "@/utils/supabase/server";
import { kstDateTime } from "@/lib/format";
export default async function ServiceExceptionsPage() {
    const { data, error } = await (
        await createClient()
    ).rpc("admin_list_service_exceptions");
    if (error)
        return (
            <p role="alert">
                전체/정산 담당자 권한 및 MFA 인증이 필요합니다. 조회 실패는 예외
                건이 없다는 의미가 아닙니다.
            </p>
        );
    return (
        <section>
            <h1 className="text-2xl font-bold">예외 종료 운영 확인</h1>
            <p className="text-muted-foreground mt-3 text-sm">
                회사·파트너 귀책 및 응급 중단은 자동 청구·환불·정산 승인을
                보류합니다. 최신 정책과 실제 제공 내용을 확인한 별도 정산 절차가
                필요합니다. 일반 종료로 임의 변경하지 마세요.
            </p>
            <ul className="mt-5 space-y-3">
                {(data ?? []).map(
                    (r: {
                        service_id: string;
                        reservation_code: string;
                        kind: string;
                        ended_at: string;
                    }) => (
                        <li
                            key={r.service_id}
                            className="rounded-lg border p-4"
                        >
                            <strong>{r.reservation_code}</strong>
                            <p>
                                {r.kind === "PROVIDER_FAULT"
                                    ? "회사·파트너 사유"
                                    : "응급 중단"}{" "}
                                · {kstDateTime(r.ended_at)}
                            </p>
                            <span className="text-amber-700">
                                청구·정산 보류
                            </span>
                        </li>
                    ),
                )}
            </ul>
            {!data?.length && <p className="mt-5">확인 대기 건이 없습니다.</p>}
        </section>
    );
}

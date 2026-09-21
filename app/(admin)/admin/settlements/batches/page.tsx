import type { Metadata } from "next";
import Link from "next/link";
import { getTransferBatches } from "./_lib/batches.server";

export const metadata: Metadata = {
    title: "이체 배치",
    robots: { index: false, follow: false },
};

const won = new Intl.NumberFormat("ko-KR");
const STATUS = {
    DRAFT: "생성됨",
    FILE_ISSUED: "파일 발급",
    COMPLETED: "지급 완료",
    CANCELLED: "취소",
} as const;

export default async function TransferBatchesPage({
    searchParams,
}: {
    searchParams: Promise<{ batch?: string }>;
}) {
    const query = await searchParams;
    let result: Awaited<ReturnType<typeof getTransferBatches>>;
    try {
        result = await getTransferBatches(query.batch ?? null);
    } catch {
        return <p role="alert">이체 배치 목록을 불러오지 못했습니다.</p>;
    }
    if (!result.allowed)
        return <p>정산 담당 권한과 2단계 인증이 필요합니다.</p>;
    const selected = result.batches.find(
        (batch) => batch.id === result.batchId,
    );

    return (
        <div className="mx-auto w-full max-w-7xl">
            <Link
                href="/admin/settlements"
                className="text-brand text-sm font-bold underline"
            >
                ← 정산 관리
            </Link>
            <h1 className="mt-4 text-2xl font-extrabold md:text-3xl">
                이체 배치
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
                승인된 정산을 파트너별 한 건의 이체로 합산한 목록입니다. 배치
                생성만으로 지급 완료 처리되지는 않습니다.
            </p>

            {result.batches.length === 0 ? (
                <p className="border-border text-muted-foreground mt-6 rounded-xl border border-dashed p-10 text-center text-sm">
                    생성된 이체 배치가 없습니다.
                </p>
            ) : (
                <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
                    <div className="space-y-2">
                        {result.batches.map((batch) => (
                            <Link
                                key={batch.id}
                                href={`/admin/settlements/batches?batch=${batch.id}`}
                                className={`block rounded-xl border p-4 ${
                                    batch.id === result.batchId
                                        ? "border-brand bg-brand/5"
                                        : "border-border bg-background"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <strong>{batch.code}</strong>
                                    <span className="text-xs font-semibold">
                                        {STATUS[batch.status]}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm">
                                    {batch.partnerCount}명 ·{" "}
                                    {batch.settlementCount}건 ·{" "}
                                    {won.format(batch.totalNet)}원
                                </p>
                                <p className="text-muted-foreground mt-1 text-xs">
                                    {new Date(batch.createdAt).toLocaleString(
                                        "ko-KR",
                                    )}{" "}
                                    · {batch.createdByName}
                                </p>
                            </Link>
                        ))}
                    </div>

                    <section className="border-border bg-background rounded-xl border p-5">
                        <h2 className="text-lg font-extrabold">
                            {selected?.code ?? "배치 상세"}
                        </h2>
                        {selected && (
                            <p className="text-muted-foreground mt-1 text-sm">
                                생성 사유: {selected.reason}
                            </p>
                        )}
                        <div className="border-border mt-4 overflow-x-auto rounded-lg border">
                            <table className="w-full min-w-[640px] text-left text-sm">
                                <thead className="bg-muted/60">
                                    <tr>
                                        <th className="p-3">파트너</th>
                                        <th className="p-3">계좌</th>
                                        <th className="p-3">예금주</th>
                                        <th className="p-3 text-right">정산</th>
                                        <th className="p-3 text-right">
                                            이체액
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-border divide-y">
                                    {result.items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="p-3 font-semibold">
                                                {item.partnerName}
                                            </td>
                                            <td className="p-3">
                                                {item.bankName} ****
                                                {item.accountLast4}
                                            </td>
                                            <td className="p-3">
                                                {item.holderName}
                                            </td>
                                            <td className="p-3 text-right">
                                                {item.settlementCount}건
                                            </td>
                                            <td className="p-3 text-right font-bold">
                                                {won.format(item.amount)}원
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

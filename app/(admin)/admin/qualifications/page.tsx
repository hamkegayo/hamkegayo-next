import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { kstDateTime } from "@/lib/format";
import { ReviewControls } from "./review-controls";

export default async function QualificationsPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; page?: string }>;
}) {
    const query = await searchParams;
    const status = query.status === "VERIFIED" ? "VERIFIED" : "PENDING";
    const page = Math.min(
        10000,
        Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1),
    );
    const supabase = await createClient();
    const { data: allowed, error: authError } = await supabase.rpc(
        "can_review_qualifications",
    );
    if (authError || allowed !== true)
        return (
            <p>
                심사 담당 권한과 2단계 인증이 필요합니다. 관리자에게 문의해
                주세요.
            </p>
        );
    const { data, error } = await supabase
        .from("partner_qualifications")
        .select(
            "id, partner_id, type, issuer, acquired_date, status, created_at",
        )
        .eq("status", status)
        .order("created_at")
        .order("id")
        .range((page - 1) * 20, page * 20);
    if (error)
        return (
            <p role="alert">
                심사 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
        );
    const rows = (data ?? []).slice(0, 20);
    const ids = [...new Set(rows.map((row) => row.partner_id))];
    const profiles = ids.length
        ? await supabase.from("profiles").select("id, name").in("id", ids)
        : null;
    const names = new Map(
        (profiles?.data ?? []).map((row) => [row.id, row.name]),
    );
    return (
        <div>
            <Link href="/admin" className="text-brand text-sm underline">
                관리자 홈
            </Link>
            <h1 className="mt-4 text-2xl font-bold">파트너 자격 심사</h1>
            <p className="text-description-foreground mt-2 text-sm">
                증빙을 확인한 뒤 사유와 함께 심사 결과를 저장해 주세요.
            </p>
            <nav aria-label="심사 상태" className="my-6 flex gap-4">
                <Link
                    href="/admin/qualifications"
                    aria-current={status === "PENDING" ? "page" : undefined}
                    className="aria-[current=page]:font-bold"
                >
                    심사 대기
                </Link>
                <Link
                    href="/admin/qualifications?status=VERIFIED"
                    aria-current={status === "VERIFIED" ? "page" : undefined}
                    className="aria-[current=page]:font-bold"
                >
                    인증 완료
                </Link>
            </nav>
            {rows.length === 0 && <p>해당 상태의 자격이 없습니다.</p>}
            <ul className="space-y-4">
                {rows.map((row) => (
                    <li
                        key={row.id}
                        className="bg-background rounded-xl border p-5"
                    >
                        <h2 className="font-bold">
                            {names.get(row.partner_id) ?? "파트너"} · {row.type}
                        </h2>
                        <p className="text-muted-foreground mt-1 text-sm">
                            {[
                                row.issuer,
                                row.acquired_date,
                                kstDateTime(row.created_at),
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                        <ReviewControls id={row.id} status={row.status} />
                    </li>
                ))}
            </ul>
            <nav aria-label="목록 페이지" className="mt-6 flex gap-4">
                {page > 1 && (
                    <Link
                        href={`/admin/qualifications?status=${status}&page=${page - 1}`}
                    >
                        이전
                    </Link>
                )}
                <span>{page} 페이지</span>
                {(data?.length ?? 0) > 20 && (
                    <Link
                        href={`/admin/qualifications?status=${status}&page=${page + 1}`}
                    >
                        다음
                    </Link>
                )}
            </nav>
        </div>
    );
}

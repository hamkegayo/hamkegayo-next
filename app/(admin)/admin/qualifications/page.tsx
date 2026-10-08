import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { kstDateTime } from "@/lib/format";
import { ReviewControls } from "./review-controls";
import { WorkHistoryReview } from "./work-history-review";
import { PartnerEvidenceFiles } from "@/components/partner-evidence-files";

export default async function QualificationsPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; page?: string; kind?: string }>;
}) {
    const query = await searchParams;
    const status = query.status === "VERIFIED" ? "VERIFIED" : "PENDING";
    const workMode = query.kind === "work";
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
    if (workMode) {
        const { data: histories, error } = await supabase
            .from("partner_work_histories")
            .select(
                "id, partner_id, hospital, period, department, duties, status, kind",
            )
            .eq("status", status)
            .order("created_at")
            .order("id")
            .range((page - 1) * 20, page * 20);
        if (error) return <p role="alert">경력 목록을 불러오지 못했습니다.</p>;
        const rows = (histories ?? []).slice(0, 20);
        const ids = [...new Set(rows.map((row) => row.partner_id))];
        const profiles = ids.length
            ? await supabase.from("profiles").select("id, name").in("id", ids)
            : null;
        const names = new Map(
            (profiles?.data ?? []).map((row) => [row.id, row.name]),
        );
        return (
            <div>
                <Link
                    href="/admin/qualifications"
                    className="text-brand underline"
                >
                    자격 심사
                </Link>
                <h1 className="mt-4 text-2xl font-bold">
                    파트너 근무 경력 심사
                </h1>
                <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                    증빙 확인 버튼으로 제출 자료를 확인하고 검증 결과를 기록해
                    주세요. 기존 별도 제출 자료는 담당자에게 확인해 주세요. 증빙
                    원본은 고객에게 공개하지 않습니다.
                </p>
                <nav aria-label="경력 심사 상태" className="my-6 flex gap-4">
                    <Link
                        href="/admin/qualifications?kind=work"
                        aria-current={status === "PENDING" ? "page" : undefined}
                    >
                        심사 대기
                    </Link>
                    <Link
                        href="/admin/qualifications?kind=work&status=VERIFIED"
                        aria-current={
                            status === "VERIFIED" ? "page" : undefined
                        }
                    >
                        검증 완료
                    </Link>
                </nav>
                {rows.length === 0 && <p>해당 상태의 경력이 없습니다.</p>}
                <ul className="space-y-4">
                    {rows.map((row) => (
                        <li
                            key={row.id}
                            className="bg-background rounded-xl border p-5"
                        >
                            <h2 className="font-bold">
                                {names.get(row.partner_id) ?? "파트너"} ·{" "}
                                {row.hospital}
                            </h2>
                            <p className="mt-2 text-sm leading-relaxed">
                                {row.kind === "COMPANION"
                                    ? "병원동행 경력"
                                    : "의료기관 근무 경력"}{" "}
                                · {row.period} · {row.department}
                            </p>
                            <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
                                {row.duties}
                            </p>
                            <WorkHistoryReview
                                id={row.id}
                                status={row.status}
                            />
                            <PartnerEvidenceFiles
                                id={row.id}
                                kind="HISTORY"
                                admin
                            />
                        </li>
                    ))}
                </ul>
                <nav aria-label="경력 목록 페이지" className="mt-6 flex gap-4">
                    {page > 1 && (
                        <Link
                            href={`/admin/qualifications?kind=work&status=${status}&page=${page - 1}`}
                        >
                            이전
                        </Link>
                    )}
                    {(histories?.length ?? 0) > 20 && (
                        <Link
                            href={`/admin/qualifications?kind=work&status=${status}&page=${page + 1}`}
                        >
                            다음
                        </Link>
                    )}
                </nav>
            </div>
        );
    }
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
            <Link
                href="/admin/qualifications?kind=work"
                className="text-brand mt-3 inline-block underline"
            >
                근무 경력 심사
            </Link>{" "}
            <Link
                href="/admin/identity-checks"
                className="text-brand mt-3 ml-3 inline-block underline"
            >
                생년월일 본인확인
            </Link>
            <p className="text-description-foreground mt-2 text-sm leading-relaxed">
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
                        <p className="text-description-foreground mt-1 text-sm leading-relaxed">
                            {[
                                row.issuer,
                                row.acquired_date,
                                kstDateTime(row.created_at),
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                        <ReviewControls id={row.id} status={row.status} />
                        <PartnerEvidenceFiles
                            id={row.id}
                            kind="QUALIFICATION"
                            admin
                        />
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

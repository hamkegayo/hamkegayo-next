import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { kstDateTime } from "@/lib/format";
import { PartnerEvidenceFiles } from "@/components/partner-evidence-files";
import { IdentityDecision } from "./identity-decision";

/**
 * 파트너 생년월일 본인확인 (#226). 심사 권한 + 2단계 인증이 필요하다.
 * 같은 파트너의 자격 증빙과 대조한 뒤 결정하면 생년월일은 즉시 파기된다.
 * 30일 안에 처리하지 않으면 매일 크론이 자동 파기한다.
 */
export default async function IdentityChecksPage() {
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
        .from("partner_identity_checks")
        .select("partner_id, birth_date, submitted_at, purge_after")
        .eq("status", "PENDING")
        .order("submitted_at")
        .limit(50);
    if (error)
        return (
            <p role="alert">
                본인확인 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
        );
    const rows = data ?? [];
    const ids = rows.map((row) => row.partner_id);
    const [profiles, quals] = ids.length
        ? await Promise.all([
              supabase.from("profiles").select("id, name").in("id", ids),
              supabase
                  .from("partner_qualifications")
                  .select("id, partner_id, type, issuer, status")
                  .in("partner_id", ids)
                  .order("created_at"),
          ])
        : [null, null];
    const names = new Map(
        (profiles?.data ?? []).map((row) => [row.id, row.name]),
    );
    return (
        <div>
            <Link
                href="/admin/qualifications"
                className="text-brand text-sm underline"
            >
                자격 심사
            </Link>
            <h1 className="mt-4 text-2xl font-bold">
                파트너 생년월일 본인확인
            </h1>
            <p className="text-description-foreground mt-2 text-sm leading-relaxed break-keep">
                파트너가 제출한 생년월일을 같은 파트너의 면허·자격증 증빙과
                대조해 주세요. 결정하면 생년월일은 즉시 파기되고 결과만
                남습니다. 30일 안에 처리하지 않으면 자동 파기됩니다.
            </p>
            {rows.length === 0 && (
                <p className="mt-6 leading-relaxed">
                    확인 대기 중인 파트너가 없습니다.
                </p>
            )}
            <ul className="mt-6 space-y-4">
                {rows.map((row) => {
                    const partnerQuals = (quals?.data ?? []).filter(
                        (q) => q.partner_id === row.partner_id,
                    );
                    return (
                        <li
                            key={row.partner_id}
                            className="bg-background rounded-xl border p-5"
                        >
                            <h2 className="font-bold">
                                {names.get(row.partner_id) ?? "파트너"} ·
                                생년월일 {row.birth_date}
                            </h2>
                            <p className="text-description-foreground mt-1 text-sm leading-relaxed">
                                제출 {kstDateTime(row.submitted_at)} · 자동 파기{" "}
                                {kstDateTime(row.purge_after)}
                            </p>
                            <h3 className="mt-4 text-sm font-bold">
                                대조할 자격 증빙
                            </h3>
                            {partnerQuals.length === 0 ? (
                                <p className="text-description-foreground text-sm leading-relaxed">
                                    등록된 자격 증빙이 없습니다. 반려 사유에
                                    증빙 등록을 안내해 주세요.
                                </p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {partnerQuals.map((q) => (
                                        <li key={q.id} className="text-sm">
                                            {q.type}
                                            {q.issuer ? ` · ${q.issuer}` : ""}
                                            <PartnerEvidenceFiles
                                                id={q.id}
                                                kind="QUALIFICATION"
                                                admin
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <IdentityDecision
                                partnerId={row.partner_id}
                                submittedAt={row.submitted_at}
                            />
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

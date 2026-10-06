import { createClient } from "@/utils/supabase/server";

/**
 * 파트너 생년월일 본인확인 상태 (#226). 생년월일은 확인 대기 중에만 남고,
 * 확인·반려 즉시, 미처리는 30일 뒤 파기된다(마이그레이션 90).
 */
export type IdentityCheckView =
    | { ok: false }
    | {
          ok: true;
          /** 수집이 열렸는지 (처리방침 개정 시행 후 partner_identity_release) */
          enabled: boolean;
          status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | null;
          /** 확인 대기 중일 때만 */
          birthDate: string | null;
          purgeAfter: string | null;
      };

export async function getMyIdentityCheck(): Promise<IdentityCheckView> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { ok: false };
        const [row, enabled] = await Promise.all([
            supabase
                .from("partner_identity_checks")
                .select("status, birth_date, purge_after")
                .eq("partner_id", user.id)
                .maybeSingle<{
                    status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
                    birth_date: string | null;
                    purge_after: string;
                }>(),
            supabase.rpc("partner_identity_collection_enabled"),
        ]);
        if (row.error) return { ok: false };
        return {
            ok: true,
            enabled: !enabled.error && enabled.data === true,
            status: row.data?.status ?? null,
            birthDate: row.data?.birth_date ?? null,
            purgeAfter:
                row.data?.status === "PENDING" ? row.data.purge_after : null,
        };
    } catch {
        return { ok: false };
    }
}

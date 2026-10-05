import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

/**
 * 로컬 Supabase service_role 클라이언트. E2E 준비·정리에만 쓴다.
 * .env.local(또는 환경 변수)이 로컬 스택이 아니면 즉시 중단한다 — 운영·스테이징 보호.
 */
export function localSupabaseAdmin() {
    const env: Record<string, string> = {};
    try {
        for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
            const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
            if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
        }
    } catch {
        // CI 처럼 환경 변수로만 주는 경우
    }
    const url =
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
        throw new Error(
            `E2E 는 로컬 Supabase 에서만 실행합니다 (현재: ${url ?? "없음"}).`,
        );
    }
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

/** 관리자 2단계 인증 등록을 매번 처음부터 검증하도록 기존 인증기를 지운다. */
export async function resetAdminMfa(email: string) {
    const admin = localSupabaseAdmin();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const account = data.users.find((u) => u.email === email);
    if (!account) {
        throw new Error(
            "관리자 시드 계정이 없습니다. `npm run seed:admin` 을 먼저 실행하세요.",
        );
    }
    const factors = await admin.auth.admin.mfa.listFactors({
        userId: account.id,
    });
    for (const f of factors.data?.factors ?? []) {
        await admin.auth.admin.mfa.deleteFactor({
            id: f.id,
            userId: account.id,
        });
    }
}

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

/**
 * 테스트가 만든 예약(병원명 접두사)과 연결 데이터를 지운다.
 *
 * 예약에는 이용자 생년월일·연락처·진료 목적이 들어가므로 상태만 바꿔 남기지 않는다.
 * 결제·서비스·지원 기록은 FK cascade 로 함께 지워지고, 예약 링크를 가진 알림은 직접 지운다.
 * 관리자 접속기록은 감사 기록이며 특정 예약을 가리키지 않으므로 남긴다.
 */
export async function deleteE2eReservations(hospitalPrefix: string) {
    const admin = localSupabaseAdmin();
    const { data, error } = await admin
        .from("reservations")
        .select("id")
        .like("hospital_name", `${hospitalPrefix}%`);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length === 0) return 0;

    for (const id of ids) {
        const { error: nErr } = await admin
            .from("notifications")
            .delete()
            .like("link", `%${id}%`);
        if (nErr) throw nErr;
    }
    const { error: rErr } = await admin
        .from("reservations")
        .delete()
        .in("id", ids);
    if (rErr) throw rErr;
    return ids.length;
}

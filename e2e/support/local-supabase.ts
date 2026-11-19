import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

/**
 * 호스트가 정확히 127.0.0.1 또는 localhost 인지 본다.
 * 접두사만 보면 `http://localhost.attacker.example` 도 통과해 service_role 키가 외부로 나간다 (#221 리뷰).
 */
export function isLocalSupabaseUrl(url: string | undefined): boolean {
    if (!url) return false;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
    }
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
}

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
    if (!url || !isLocalSupabaseUrl(url)) {
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
    // 신규 방식(#300)의 환불 기록은 예약 삭제를 막는 FK(on delete 없음)라 먼저 지운다.
    const { error: fErr } = await admin
        .from("reservation_refunds")
        .delete()
        .in("reservation_id", ids);
    if (fErr) throw fErr;
    const { error: rErr } = await admin
        .from("reservations")
        .delete()
        .in("id", ids);
    if (rErr) throw rErr;
    return ids.length;
}

/** 직접 배정 E2E 가 재배정 대상으로 쓰는 임시 파트너 (#300). 시드 파트너 한 명으로는 재배정을 볼 수 없다. */
export const E2E_SECOND_PARTNER = {
    email: "e2e-second-partner@partner.hamkegayo.internal",
    name: "E2E두번째파트너",
} as const;

/** 활동 중인 두 번째 파트너를 만든다(이미 있으면 재사용). 반환값은 profiles.id */
export async function ensureSecondPartner(): Promise<string> {
    const admin = localSupabaseAdmin();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let id = data?.users.find((u) => u.email === E2E_SECOND_PARTNER.email)?.id;
    if (!id) {
        const created = await admin.auth.admin.createUser({
            email: E2E_SECOND_PARTNER.email,
            password: "e2e-second-1234!",
            email_confirm: true,
        });
        if (created.error || !created.data.user) {
            throw created.error ?? new Error("임시 파트너 생성 실패");
        }
        id = created.data.user.id;
    }
    const { error } = await admin.from("profiles").upsert({
        id,
        role: "PARTNER",
        name: E2E_SECOND_PARTNER.name,
        email: E2E_SECOND_PARTNER.email,
        phone: "01099990000",
        phone_verified_at: new Date().toISOString(),
        status: "ACTIVE",
    });
    if (error) throw error;
    return id;
}

/** 임시 파트너를 지운다. 예약이 먼저 지워진 뒤에 부른다. */
export async function deleteSecondPartner() {
    const admin = localSupabaseAdmin();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = data?.users.find((x) => x.email === E2E_SECOND_PARTNER.email);
    if (u) await admin.auth.admin.deleteUser(u.id);
}

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { openingEventEmailHash } from "./opening-event-email-hash";

/**
 * registered: 현재 인증 이메일의 HMAC이 등록돼 있다.
 * missing: 등록할 수 있지만 아직 없거나 이메일이 바뀌었다.
 * unavailable: 미인증 이메일·키 없음·조회 실패로 판단할 수 없다.
 */
export type OpeningEventEmailStatus = "registered" | "missing" | "unavailable";

/** 읽기 전용. 조회(GET)·화면 렌더링은 이것만 쓴다 — 프리페치·크롤러로 식별값이 저장되지 않게 한다 (#283 리뷰). */
export async function openingEventEmailStatus(
    user: User,
): Promise<OpeningEventEmailStatus> {
    return (await readIdentity(user)).status;
}

/** getUser()로 확인한 서버 사용자만 전달한다. 프로필 입력·클라이언트 이메일은 사용하지 않는다. POST 경로에서만 호출한다. */
export async function ensureOpeningEventEmail(user: User): Promise<boolean> {
    const { status, identityHash } = await readIdentity(user);
    if (status !== "missing") return status === "registered";
    const { error } = await createAdminClient().rpc(
        "register_opening_event_email",
        { p_customer_id: user.id, p_identity_hash: identityHash },
    );
    return !error;
}

async function readIdentity(
    user: User,
): Promise<{ status: OpeningEventEmailStatus; identityHash?: string }> {
    if (!user.email || !user.email_confirmed_at)
        return { status: "unavailable" };
    const key = process.env.OPENING_EVENT_EMAIL_HMAC_KEY;
    if (!key || key.length < 32) return { status: "unavailable" };
    const identityHash = openingEventEmailHash(user.email, key);
    const { data: identity, error } = await createAdminClient()
        .from("opening_event_identities")
        .select("identity_hash, verification_source, verified_at")
        .eq("customer_id", user.id)
        .maybeSingle();
    if (error) return { status: "unavailable" };
    const current =
        identity?.identity_hash === identityHash &&
        identity.verification_source === "SUPABASE_EMAIL" &&
        new Date(identity.verified_at).getTime() <= Date.now();
    return { status: current ? "registered" : "missing", identityHash };
}

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { openingEventEmailHash } from "./opening-event-email-hash";

/** getUser()로 확인한 서버 사용자만 전달한다. 프로필 입력·클라이언트 이메일은 사용하지 않는다. */
export async function ensureOpeningEventEmail(user: User): Promise<boolean> {
    if (!user.email || !user.email_confirmed_at) return false;
    const key = process.env.OPENING_EVENT_EMAIL_HMAC_KEY;
    if (!key || key.length < 32) return false;
    const { error } = await createAdminClient().rpc(
        "register_opening_event_email",
        {
            p_customer_id: user.id,
            p_identity_hash: openingEventEmailHash(user.email, key),
        },
    );
    return !error;
}

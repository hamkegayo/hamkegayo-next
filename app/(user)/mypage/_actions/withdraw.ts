"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { WITHDRAW_BLOCKER_MESSAGE } from "@/lib/auth/admin-withdrawal";
// "use server" 파일에서 export 하면 공개 서버 액션이 되므로 서버 전용 모듈에 둔다(#293).
import { lockAuthAccount } from "@/lib/auth/withdraw-account.server";

/**
 * 회원 탈퇴 (#72) — 개인정보처리방침 제4조 · 제11조 ③.
 *
 *  ⚠️ **auth.users 를 지우지 않는다.** profiles 가 auth.users 를
 *     `on delete cascade` 로 참조하고, 12개 테이블이 다시 profiles 를
 *     cascade 로 참조한다. 계정을 지우면 결제·정산·수행기록이 전부
 *     함께 사라져 방침이 공개한 보존기간(5년)을 지킬 수 없다.
 *
 *  대신 두 단계로 나눈다.
 *    ① `withdraw_member()` — 한 트랜잭션에서 개인식별 정보를 분리 보관
 *       테이블로 옮기고 원본을 지운다. 여기서 status 가 WITHDRAWN 이 되며,
 *       기존 게이트(미들웨어·RLS·RPC)가 전부 ACTIVE 를 요구하므로 이 시점에
 *       계정은 사실상 잠긴다.
 *    ② auth 정리 — 로그인 자체를 막고 이메일 주소를 비운다. 실패해도
 *       ①이 이미 계정을 잠갔으므로 탈퇴는 성립한다. 다시 가입할 때
 *       같은 주소를 못 쓰는 문제만 남아 로그로 남기고 넘어간다.
 *
 *  소셜 로그인 연결(카카오·네이버)은 ①에서 함께 지워진다(#293). profiles 가
 *  WITHDRAWN 으로 바뀌는 순간 DB 트리거(마이그레이션 109)가 같은 트랜잭션에서
 *  지우므로, 같은 소셜 계정으로 다시 로그인하면 새 계정으로 가입된다.
 *
 *  순서가 반대면 안 된다. auth 를 먼저 건드리고 ①이 실패하면 개인정보는
 *  그대로인데 본인은 접근할 수 없는 상태가 된다.
 */

export type WithdrawResult = { ok: true } | { ok: false; message: string };

/** RPC 가 던지는 거절 사유 → 사용자 안내 (lib/auth/admin-withdrawal.ts 와 공유) */
const BLOCKER_MESSAGE = WITHDRAW_BLOCKER_MESSAGE;

/**
 * 본인 계정을 탈퇴 처리한다.
 *
 *  @param reason 이용자가 남긴 사유. 저장되므로 개인정보를 담지 않는다.
 */
export async function withdrawMember(reason?: string): Promise<WithdrawResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const admin = createAdminClient();
    const { error } = await admin.rpc("withdraw_member", {
        p_user_id: user.id,
        // 자유 입력을 그대로 넣지 않는다 — 사유란에 연락처를 적는 사람이 있다.
        p_reason: reason?.trim().slice(0, 200) || null,
    });

    if (error) {
        const message = BLOCKER_MESSAGE[error.message];
        if (message) return { ok: false, message };

        console.error("[withdraw] 실패:", user.id, error.message);
        return {
            ok: false,
            message: "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    // 실패해도 탈퇴는 이미 성립했다. 실패를 돌려주면 "탈퇴가 안 됐다" 고 오해하게 되므로
    // 결과는 쓰지 않는다(로그는 lockAuthAccount 가 남긴다).
    await lockAuthAccount(user.id);
    await supabase.auth.signOut();

    return { ok: true };
}

"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 회원 탈퇴 (#72) — 개인정보처리방침 제4조 · 제11조 ②.
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
 *  순서가 반대면 안 된다. auth 를 먼저 건드리고 ①이 실패하면 개인정보는
 *  그대로인데 본인은 접근할 수 없는 상태가 된다.
 */

export type WithdrawResult = { ok: true } | { ok: false; message: string };

/** RPC 가 던지는 거절 사유 → 사용자 안내 */
const BLOCKER_MESSAGE: Record<string, string> = {
    UNPAID_CHARGE:
        "결제되지 않은 추가 요금이 있어 탈퇴할 수 없습니다. 마이페이지에서 결제를 완료한 뒤 다시 시도해 주세요.",
    ACTIVE_RESERVATION:
        "진행 예정인 예약이 있어 탈퇴할 수 없습니다. 예약을 취소하거나 이용을 마친 뒤 다시 시도해 주세요.",
    ACTIVE_SERVICE:
        "맡고 계신 서비스가 남아 있어 탈퇴할 수 없습니다. 수행을 마친 뒤 다시 시도해 주세요.",
    PENDING_SETTLEMENT:
        "지급되지 않은 정산금이 남아 있어 탈퇴할 수 없습니다. 고객센터로 문의해 주세요.",
    PROFILE_NOT_FOUND: "회원 정보를 찾을 수 없습니다.",
};

/**
 * 로그인 수단을 잠근다.
 *
 *  이메일을 예약된 `.invalid` 도메인으로 바꿔 실제 주소를 놓아 준다 —
 *  같은 주소로 다시 가입할 수 있어야 한다. 그대로 두면 탈퇴가 주소를
 *  영구히 묶는다.
 */
async function lockAuthAccount(userId: string): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, {
        email: `withdrawn+${userId}@users.hamkegayo.invalid`,
        // 100년. GoTrue 에 "영구" 옵션이 없어 사실상의 상한을 쓴다.
        ban_duration: "876600h",
    });

    if (error) {
        // 탈퇴 자체는 이미 성립했다. 여기서 실패를 사용자에게 돌려주면
        // "탈퇴가 안 됐다" 고 오해하게 된다.
        console.error("[withdraw] auth 정리 실패:", userId, error.message);
    }
}

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

    await lockAuthAccount(user.id);
    await supabase.auth.signOut();

    return { ok: true };
}

/**
 * 탈퇴 계정의 로그인 수단 잠금 — 서버 전용 (#72 · #293).
 *
 *  ⚠️ `"use server"` 파일에 두지 않는다. 서버 액션 파일에서 export 하면
 *     임의의 userId 로 호출할 수 있는 공개 엔드포인트가 된다.
 *     본인 탈퇴(mypage withdraw 액션)와 운영자 탈퇴(admin withdrawals 액션)가
 *     DB 탈퇴가 성공한 뒤에만 이 함수를 부른다.
 */

import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 로그인 수단을 잠근다.
 *
 *  이메일을 예약된 `.invalid` 도메인으로 바꿔 실제 주소를 놓아 준다 —
 *  같은 주소로 다시 가입할 수 있어야 한다. 그대로 두면 탈퇴가 주소를
 *  영구히 묶는다.
 */
export async function lockAuthAccount(
    userId: string,
): Promise<{ ok: boolean; error?: string }> {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, {
        email: `withdrawn+${userId}@users.hamkegayo.invalid`,
        // 100년. GoTrue 에 "영구" 옵션이 없어 사실상의 상한을 쓴다.
        ban_duration: "876600h",
    });

    if (error) {
        // 탈퇴 자체는 이미 성립했다(DB 상태가 WITHDRAWN 이라 기존 게이트가 막는다).
        console.error("[withdraw] auth 정리 실패:", userId, error.message);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

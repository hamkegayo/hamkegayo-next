"use server";

import { revalidatePath } from "next/cache";

import {
    adminWithdrawErrorMessage,
    ADMIN_WITHDRAW_ERROR_MESSAGE,
    classifyMemberLookupQuery,
    normalizeWithdrawalReason,
} from "@/lib/auth/admin-withdrawal";
import { lockAuthAccount } from "@/lib/auth/withdraw-account.server";
import { createClient } from "@/utils/supabase/server";

/**
 * 로그인할 수 없는 회원의 운영자 탈퇴 처리 (#293).
 *
 *  고객문의 채널로 회원 본인의 탈퇴 의사를 확인한 경우에만 처리한다
 *  (개인정보처리방침 제12조 ③). 연락이 닿지 않으면 탈퇴하지 않고 계정을 유지한다.
 *
 *  ⚠️ service_role 을 쓰지 않는다. 로그인한 관리자 세션으로 RPC 를 부르고,
 *     통과 여부는 DB 의 is_admin_live()(활성 ADMIN + aal2 + 비밀번호 변경 완료)가 정한다.
 *     service_role 은 DB 탈퇴가 커밋된 뒤 auth 잠금(lockAuthAccount)에만 쓴다.
 */

export type MemberForWithdrawal = {
    id: string;
    role: "USER" | "PARTNER";
    name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    withdrawn_at: string | null;
    blocker_code: string | null;
};

export type FindMemberResult =
    | { ok: true; members: MemberForWithdrawal[] }
    | { ok: false; message: string };

/** 이메일·휴대전화번호·회원 UUID 정확 일치로 탈퇴 대상(USER·PARTNER)을 찾는다. 조회마다 접속기록이 남는다. */
export async function findMemberForWithdrawal(
    query: string,
): Promise<FindMemberResult> {
    if (typeof query !== "string")
        return {
            ok: false,
            message: ADMIN_WITHDRAW_ERROR_MESSAGE.invalid_query,
        };
    // 형식이 틀린 검색어는 DB 까지 보내지 않는다(최종 판정은 DB 가 다시 한다).
    if (classifyMemberLookupQuery(query).kind === "invalid")
        return {
            ok: false,
            message: ADMIN_WITHDRAW_ERROR_MESSAGE.invalid_query,
        };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
        "admin_find_member_for_withdrawal",
        { p_query: query.trim() },
    );
    if (error) {
        if (error.message !== "forbidden" && error.message !== "invalid_query")
            console.error("[admin-withdraw] 조회 실패:", error.message);
        return { ok: false, message: adminWithdrawErrorMessage(error) };
    }
    return { ok: true, members: (data ?? []) as MemberForWithdrawal[] };
}

export type AdminWithdrawResult =
    | { ok: true; authLockWarning?: false; message: string }
    | { ok: true; authLockWarning: true; message: string }
    | { ok: false; message: string };

/** 운영자 탈퇴. DB 탈퇴가 성공한 뒤에만 로그인 수단을 잠근다. */
export async function withdrawMemberByAdmin(input: {
    userId: string;
    reason: string;
    socialUnlinkId?: string | null;
}): Promise<AdminWithdrawResult> {
    const checked = normalizeWithdrawalReason(input?.reason ?? "");
    if (!checked.ok) return { ok: false, message: checked.message };
    if (typeof input.userId !== "string" || !input.userId)
        return {
            ok: false,
            message: ADMIN_WITHDRAW_ERROR_MESSAGE.invalid_input,
        };

    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_withdraw_member", {
        p_user_id: input.userId,
        p_reason: checked.reason,
        p_social_unlink_id: input.socialUnlinkId ?? null,
    });
    if (error) {
        // 거절되면 DB 는 아무것도 바꾸지 않았다. auth 도 건드리지 않는다.
        if (!(error.message in ADMIN_WITHDRAW_ERROR_MESSAGE))
            console.error(
                "[admin-withdraw] 실패:",
                input.userId,
                error.message,
            );
        return { ok: false, message: adminWithdrawErrorMessage(error) };
    }

    // ⚠️ signOut 을 부르지 않는다 — 처리한 관리자 본인이 로그아웃된다.
    const locked = await lockAuthAccount(input.userId);

    revalidatePath("/admin");
    revalidatePath("/admin/social-unlinks");
    revalidatePath("/admin/withdrawals");

    if (!locked.ok)
        return {
            ok: true,
            authLockWarning: true,
            message:
                "탈퇴는 처리됐지만 로그인 잠금(이메일 주소 해제·차단)에 실패했습니다. 계정은 탈퇴 상태라 이용할 수 없으며, 같은 이메일로 다시 가입하려면 개발 담당에게 잠금 재시도를 요청해 주세요.",
        };
    return {
        ok: true,
        message: input.socialUnlinkId
            ? "탈퇴 처리했습니다. 연결 해제 기록도 함께 파기됐습니다."
            : "탈퇴 처리했습니다.",
    };
}

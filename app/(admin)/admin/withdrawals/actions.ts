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
    /** 고객문의 채널로 본인 탈퇴 의사를 확인했다는 운영자 확인. 화면 우회 호출도 막는다. */
    confirmed: boolean;
    socialUnlinkId?: string | null;
}): Promise<AdminWithdrawResult> {
    if (input?.confirmed !== true)
        return {
            ok: false,
            message: ADMIN_WITHDRAW_ERROR_MESSAGE.intent_not_confirmed,
        };
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
    // 잠금 결과를 접속기록에 남겨 실패 건을 나중에 찾을 수 있게 한다(탈퇴는 이미 성립).
    await supabase.rpc("admin_record_auth_lock", {
        p_user_id: input.userId,
        p_ok: locked.ok,
        p_retry: false,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/social-unlinks");
    revalidatePath("/admin/withdrawals");

    if (!locked.ok)
        return {
            ok: true,
            authLockWarning: true,
            message:
                '탈퇴는 처리됐지만 로그인 잠금(이메일 주소 해제·차단)에 실패했습니다. 계정은 탈퇴 상태라 이용할 수 없으며, 같은 이메일로 다시 가입하려면 회원 검색 결과에서 "로그인 잠금 다시 시도"를 눌러 주세요.',
        };
    return {
        ok: true,
        message: input.socialUnlinkId
            ? "탈퇴 처리했습니다. 연결 해제 기록도 함께 파기됐습니다."
            : "탈퇴 처리했습니다.",
    };
}

/**
 * 탈퇴 후 auth 잠금 재시도. 이미 탈퇴한 회원의 이메일 주소 해제·로그인 차단만 다시 건다.
 * 권한·대상(탈퇴 상태의 USER·PARTNER)은 DB RPC 가 확인한 뒤에만 service_role 을 쓴다.
 */
export async function retryAuthLockByAdmin(
    userId: string,
): Promise<{ ok: boolean; message: string }> {
    if (typeof userId !== "string" || !userId)
        return {
            ok: false,
            message: ADMIN_WITHDRAW_ERROR_MESSAGE.invalid_input,
        };

    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_prepare_auth_lock_retry", {
        p_user_id: userId,
    });
    if (error) return { ok: false, message: adminWithdrawErrorMessage(error) };

    const locked = await lockAuthAccount(userId);
    await supabase.rpc("admin_record_auth_lock", {
        p_user_id: userId,
        p_ok: locked.ok,
        p_retry: true,
    });
    if (!locked.ok)
        return {
            ok: false,
            message:
                "로그인 잠금에 다시 실패했습니다. 잠시 후 다시 시도하고, 계속되면 개발 담당에게 알려 주세요.",
        };
    revalidatePath("/admin/withdrawals");
    return { ok: true, message: "로그인 잠금을 다시 걸었습니다." };
}

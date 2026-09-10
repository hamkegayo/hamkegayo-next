"use server";

/**
 * 약관·방침 재동의 (#91).
 *
 *  개정된 문서에 다시 동의한다. 화면은 이미 어느 항목이 재동의 대상인지
 *  보여주고 있었는데(#122) 누를 수단이 없었다.
 *
 *  ⚠️ **철회는 여기서 다루지 않는다.** 필수 동의 4종은 철회하면 서비스를
 *     이용할 수 없다. 철회는 탈퇴(#72)와 같은 무게라 별도 경로여야 한다.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { AGREEMENT_VERSION, type AgreementType } from "@/lib/legal/agreements";

export type ReconsentResult = { ok: true } | { ok: false; message: string };

const TYPES: AgreementType[] = ["SERVICE", "PRIVACY", "PERSONAL", "SENSITIVE"];

/**
 * 재동의 대상 항목에 현행 버전으로 동의를 남긴다.
 *
 *  기존 행은 지우지 않는다 — 그것이 이력이다(#58).
 *  현행 버전에 이미 동의했다면 유니크 제약에 걸리므로 조용히 넘어간다.
 */
export async function reconsentAll(): Promise<ReconsentResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { ok: false, message: "로그인이 필요합니다." };
    }

    const admin = createAdminClient();

    // 쓰기 정책이 없는 원장이라 service_role 로 넣는다.
    // 값은 서버가 정한다 — 클라이언트가 버전을 보내면 아무 버전에나 동의한
    // 기록을 만들 수 있다.
    const rows = TYPES.map((type) => ({
        user_id: user.id,
        agreement_type: type,
        version: AGREEMENT_VERSION[type],
    }));

    const { error } = await admin.from("user_agreements").upsert(rows, {
        onConflict: "user_id,agreement_type,version",
        ignoreDuplicates: true,
    });

    if (error) {
        console.error("[reconsentAll] 재동의 적재 실패:", error);
        return {
            ok: false,
            message: "동의 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    // 안내 알림은 읽음 처리하지 않는다 — 사용자가 목록에서 직접 확인한다.
    revalidatePath("/mypage/profile");
    return { ok: true };
}

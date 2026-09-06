"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import {
    bankName,
    isValidAccountNumber,
    isValidBankCode,
    normalizeAccountNumber,
} from "@/lib/banks";

/**
 * 파트너 정산 계좌 등록·변경 (#51).
 *
 *  ⚠️ **service_role 을 쓰지 않는다.** 쿠키 세션으로 RPC 를 부르면
 *     `auth.uid()` 가 서버에서 주인을 정한다. 앱이 partner_id 를 넘기는
 *     구조였다면 남의 계좌를 바꾸는 요청을 막을 방법이 없다.
 *
 *  전체 계좌번호는 여기서 DB 로 한 번 들어가고 **다시 나오지 않는다.**
 *  조회는 뒷 4자리만 돌려준다(`get_my_payout_account`).
 */

export type PayoutAccount = {
    bankCode: string;
    bankName: string;
    /** 마스킹 표시용 뒷 4자리 */
    last4: string;
    holderName: string;
    /** 예금주 검증 완료 시각. 1원 인증 도입 전까지 항상 null */
    verifiedAt: string | null;
    updatedAt: string;
};

export type SavePayoutResult =
    { ok: true; last4: string } | { ok: false; message: string };

/** RPC 예외 → 사용자 안내 */
const ERROR_MESSAGE: Record<string, string> = {
    not_authenticated: "로그인이 필요합니다.",
    not_partner: "파트너 계정만 정산 계좌를 등록할 수 있습니다.",
    invalid_account: "계좌번호를 다시 확인해 주세요.",
    invalid_holder: "예금주명을 다시 확인해 주세요.",
    invalid_bank: "은행을 선택해 주세요.",
};

/** 본인 계좌 조회 — 마스킹된 것만 내려온다 */
export async function getMyPayoutAccount(): Promise<PayoutAccount | null> {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_my_payout_account");

    const row = (
        data as
            | {
                  bank_code: string;
                  bank_name: string;
                  last4: string;
                  holder_name: string;
                  verified_at: string | null;
                  updated_at: string;
              }[]
            | null
    )?.[0];

    if (!row) return null;

    return {
        bankCode: row.bank_code,
        // 저장 시점 이름을 우선한다. 목록에서 사라진 은행도 그대로 보여야 한다.
        bankName: row.bank_name || (bankName(row.bank_code) ?? "은행"),
        last4: row.last4,
        holderName: row.holder_name,
        verifiedAt: row.verified_at,
        updatedAt: row.updated_at,
    };
}

/**
 * 계좌를 등록하거나 바꾼다.
 *
 *  검증은 화면·서버 액션·DB 제약 세 곳에 있다. 겹치는 것이 아니라 서로
 *  다른 것을 막는다 — 화면은 오타, 여기는 위조된 요청, DB 는 다른 경로로
 *  들어오는 쓰기.
 */
export async function savePayoutAccount(input: {
    bankCode: string;
    accountNumber: string;
    holderName: string;
}): Promise<SavePayoutResult> {
    const name = bankName(input.bankCode);
    if (!isValidBankCode(input.bankCode) || !name) {
        return { ok: false, message: "은행을 선택해 주세요." };
    }

    const digits = normalizeAccountNumber(input.accountNumber);
    if (!isValidAccountNumber(digits)) {
        return {
            ok: false,
            message: "계좌번호는 숫자 8~20자리로 입력해 주세요.",
        };
    }

    const holder = input.holderName.trim();
    if (holder.length < 2 || holder.length > 20) {
        return { ok: false, message: "예금주명을 정확히 입력해 주세요." };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("upsert_my_payout_account", {
        p_bank_code: input.bankCode,
        p_bank_name: name,
        p_account_number: digits,
        p_holder_name: holder,
    });

    if (error) {
        const message = ERROR_MESSAGE[error.message];
        if (message) return { ok: false, message };

        console.error("[payout] 저장 실패:", error.message);
        return {
            ok: false,
            message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    revalidatePath("/partner/settlement");

    return { ok: true, last4: (data as { last4: string }).last4 };
}

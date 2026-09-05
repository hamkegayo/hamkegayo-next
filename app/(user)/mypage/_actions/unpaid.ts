"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { generatePayToken } from "@/lib/payments/order";

/**
 * 미결제 추가결제 결제 진입 (#75).
 *
 *  기한이 지나면 링크 토큰이 죽어 결제할 방법이 사라진다. 로그인한 본인은
 *  여기서 새 토큰을 받아 같은 결제 페이지로 들어간다 — "내야 하는데 낼 수가
 *  없는" 상태를 만들지 않는다.
 *
 *  금액은 재발급으로 바뀌지 않는다. RPC 가 본인 여부와 상태만 확인하고
 *  토큰만 갈아 끼운다.
 */
const TOKEN_VALID_DAYS = 3;

export async function payUnpaidCharge(paymentId: string) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const token = generatePayToken();
    const { error } = await supabase.rpc("reissue_extension_token", {
        p_payment_id: paymentId,
        p_token: token,
        p_expires: new Date(
            Date.now() + TOKEN_VALID_DAYS * 86_400_000,
        ).toISOString(),
    });

    // 본인이 아니거나 이미 결제된 건이다. 목록으로 돌려보낸다.
    if (error) redirect("/mypage?unpaid=error");

    redirect(`/pay/${token}`);
}

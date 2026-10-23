import { after } from "next/server";

import {
    handleKakaoUnlink,
    type KakaoUnlinkDeps,
} from "@/lib/auth/kakao-unlink";
import { sendKakaoUnlinkAlert } from "@/lib/auth/kakao-unlink-alert.server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

function deps(): KakaoUnlinkDeps {
    return {
        adminKey: process.env.KAKAO_ADMIN_KEY,
        record: async (event) => {
            const { data, error } = await createAdminClient().rpc(
                "record_social_unlink",
                {
                    p_provider: "kakao",
                    p_provider_user_id: event.userId,
                    p_referrer_type: event.referrerType,
                },
            );
            if (error) throw error;
            return data === true;
        },
        // 카카오의 3초 응답 제한을 지키도록 메일은 응답 뒤에 보낸다.
        notify: (event) => after(() => sendKakaoUnlinkAlert(event)),
    };
}

// 핸들러의 두 번째 인자(컨텍스트)를 넘기지 않도록 요청만 받는다.
export const GET = (request: Request) => handleKakaoUnlink(request, deps());
export const POST = (request: Request) => handleKakaoUnlink(request, deps());

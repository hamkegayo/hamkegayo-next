import { z } from "zod";

import { NAVER_LOGIN_ENABLED } from "./social";

const NAVER_PROFILE_URL = "https://openapi.naver.com/v1/nid/me";
const RESPONSE_HEADERS = {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
};

const profileSchema = z.object({
    resultcode: z.literal("00"),
    response: z.object({
        id: z.string().trim().min(1),
        email: z.email().optional(),
        name: z.string().trim().min(1).optional(),
    }),
});

function failure(status: number, error: string) {
    return Response.json({ error }, { status, headers: RESPONSE_HEADERS });
}

/**
 * 네이버 프로필 email은 기본이 네이버ID@naver.com이지만 사용자가 외부 메일로 바꿀 수 있고
 * 변경 주소의 소유 확인 여부는 문서에 없다. 네이버가 발급한 naver.com 주소만 검증된 이메일로 본다.
 */
function isNaverMailbox(email: string) {
    return email.toLowerCase().endsWith("@naver.com");
}

/**
 * Supabase는 최상위 sub/email을 읽지만 네이버는 response 안에 반환한다.
 * `enabled`는 네이버 로그인을 켠 환경인지다. 꺼져 있으면 Supabase에 provider만 켜져 있어도
 * 프로필을 넘기지 않는다. 라우트는 두 번째 인자에 컨텍스트를 넘기므로 직접 연결하지 말고 감싸서 쓴다.
 */
export async function getNaverUserinfo(
    request: Request,
    enabled = NAVER_LOGIN_ENABLED,
): Promise<Response> {
    if (!enabled) return failure(503, "provider_disabled");
    const authorization = request.headers.get("authorization");
    if (
        !authorization ||
        authorization.length > 4096 ||
        !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(authorization)
    ) {
        return failure(401, "invalid_token");
    }

    try {
        // 개인정보처리방침 제1조·제2조 — 인증에 필요한 ID·이메일·이름만 전달.
        // 토큰은 헤더로만 전달하고, 원본 프로필과 토큰을 저장·로그 출력하지 않는다.
        const upstream = await fetch(NAVER_PROFILE_URL, {
            headers: {
                Authorization: authorization,
                Accept: "application/json",
            },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
        });
        if (upstream.status === 401 || upstream.status === 403) {
            return failure(401, "invalid_token");
        }
        if (!upstream.ok) return failure(502, "provider_unavailable");

        const parsed = profileSchema.safeParse(await upstream.json());
        if (!parsed.success) return failure(502, "invalid_provider_response");

        const { id, email, name } = parsed.data.response;
        // 이메일 미동의는 값을 만들어 채우지 않는다. Supabase가 가입을 거절한다.
        // 네이버 응답에는 이메일 인증 여부가 없다. naver.com 주소만 email_verified를 알리고,
        // 외부 메일은 미검증으로 두어 Supabase의 인증 메일 확인을 거치게 한다.
        return Response.json(
            {
                sub: id,
                ...(email && { email }),
                ...(name && { name }),
                ...(email && isNaverMailbox(email) && { email_verified: true }),
            },
            { headers: RESPONSE_HEADERS },
        );
    } catch {
        return failure(502, "provider_unavailable");
    }
}

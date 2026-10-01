import { z } from "zod";

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

/** Supabase는 최상위 sub/email을 읽지만 네이버는 response 안에 반환한다. */
export async function getNaverUserinfo(request: Request): Promise<Response> {
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
        // 네이버 응답에는 이메일 인증 여부가 없으므로 email_verified를 단정하지 않는다.
        return Response.json(
            { sub: id, ...(email && { email }), ...(name && { name }) },
            { headers: RESPONSE_HEADERS },
        );
    } catch {
        return failure(502, "provider_unavailable");
    }
}

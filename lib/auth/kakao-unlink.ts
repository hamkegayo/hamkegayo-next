import { timingSafeEqual } from "node:crypto";

/**
 * 카카오 연결 해제 웹훅 (#291).
 *
 * 사용자가 카카오 쪽에서 앱 연결을 끊거나 카카오계정을 탈퇴하면 카카오가 GET 또는 POST 로
 * `app_id`·`user_id`·`referrer_type` 을 보낸다. 헤더는 `Authorization: KakaoAK {대표 어드민 키}`.
 * 우리는 기록하고 관리자에게 알리기만 한다(C안). 회원 데이터는 바꾸지 않는다.
 *
 * 카카오는 3초 안의 200 응답을 요구하고, 사용자 정보가 없거나 오류여도 200 을 기대한다.
 * 그래서 인증된 요청은 기록 실패·형식 오류도 200 으로 답한다. 인증되지 않은 요청만 401 이다.
 * 연결 해제 웹훅은 카카오가 재전송하지 않으므로 이 요청이 유일한 기회다. 기록 실패와 형식 거절은
 * 개인정보 없는 진단 로그로 남기고, 기록 실패는 관리자에게도 알린다(#292 리뷰).
 * 어드민 키·요청 원문·회원번호는 로그에 남기지 않는다.
 */

export const KAKAO_UNLINK_REFERRERS = [
    "ACCOUNT_DELETE",
    "FORCED_ACCOUNT_DELETE",
    "UNLINK_FROM_ADMIN",
    "UNLINK_FROM_APPS",
    "INCOMPLETE_SIGN_UP",
] as const;

export type KakaoUnlinkReferrer = (typeof KAKAO_UNLINK_REFERRERS)[number];

export type KakaoUnlinkEvent = {
    userId: string;
    referrerType: KakaoUnlinkReferrer;
};

export type KakaoUnlinkDeps = {
    /** 대표 어드민 키. 없으면 요청을 처리하지 않는다 */
    adminKey: string | undefined;
    /** 새로 기록했으면 true, 같은 미처리 건이 있으면 false */
    record: (event: KakaoUnlinkEvent) => Promise<boolean>;
    /**
     * 새로 기록했거나 기록에 실패했을 때 부른다(재전송으로 합쳐진 건은 부르지 않는다).
     * 응답을 늦추지 않도록 호출부가 응답 뒤로 미룬다.
     */
    notify: (event: KakaoUnlinkEvent, result: { recorded: boolean }) => void;
};

const NO_STORE = { "Cache-Control": "no-store" };

function sameSecret(actual: string, expected: string): boolean {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

async function readParams(request: Request): Promise<URLSearchParams> {
    const params = new URL(request.url).searchParams;
    if (request.method !== "POST") return params;
    try {
        const type = request.headers.get("content-type") ?? "";
        if (type.includes("application/json")) {
            const body = (await request.json()) as Record<string, unknown>;
            for (const [k, v] of Object.entries(body ?? {}))
                if (typeof v === "string" || typeof v === "number")
                    params.set(k, String(v));
        } else {
            const body = new URLSearchParams(await request.text());
            for (const [k, v] of body) params.set(k, v);
        }
    } catch {
        // 본문을 못 읽으면 쿼리만 쓴다
    }
    return params;
}

export function parseKakaoUnlink(
    params: URLSearchParams,
): KakaoUnlinkEvent | null {
    const userId = params.get("user_id") ?? "";
    const referrerType = params.get("referrer_type") ?? "";
    if (!/^[0-9]{1,20}$/.test(userId)) return null;
    if (!(KAKAO_UNLINK_REFERRERS as readonly string[]).includes(referrerType))
        return null;
    return { userId, referrerType: referrerType as KakaoUnlinkReferrer };
}

export async function handleKakaoUnlink(
    request: Request,
    deps: KakaoUnlinkDeps,
): Promise<Response> {
    const key = deps.adminKey?.trim();
    if (!key) return new Response(null, { status: 503, headers: NO_STORE });

    const authorization = request.headers.get("authorization") ?? "";
    if (!sameSecret(authorization, `KakaoAK ${key}`))
        return new Response(null, { status: 401, headers: NO_STORE });

    const params = await readParams(request);
    const event = parseKakaoUnlink(params);
    if (!event) {
        // 카카오가 새 사유를 추가했을 수 있다. 사유 값만 남긴다(회원번호는 빼고).
        console.error(
            "[kakao-unlink] 형식 거절:",
            JSON.stringify((params.get("referrer_type") ?? "").slice(0, 40)),
            /^[0-9]{1,20}$/.test(params.get("user_id") ?? "")
                ? "user_id 정상"
                : "user_id 형식 오류",
        );
        return new Response(null, { status: 200, headers: NO_STORE });
    }

    let recorded: boolean;
    try {
        recorded = await deps.record(event);
        if (!recorded)
            return new Response(null, { status: 200, headers: NO_STORE });
    } catch (error) {
        const code =
            error && typeof error === "object" && "code" in error
                ? String((error as { code: unknown }).code)
                : "unknown";
        console.error("[kakao-unlink] 기록 실패:", event.referrerType, code);
        recorded = false;
    }
    // 기록 실패도 200 으로 답한다. 카카오가 웹훅을 끄지 않게 하기 위함이다.
    deps.notify(event, { recorded });
    return new Response(null, { status: 200, headers: NO_STORE });
}

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
 * 연결 해제 웹훅은 카카오가 다시 보내지 않으므로 이 요청이 유일한 기회다(#292 리뷰).
 *  - 기록 실패: 응답 뒤에 몇 번 다시 기록하고, 끝내 실패하면 관리자에게 알린다.
 *  - 모르는 사유(user_id 는 정상): 카카오가 사유 값을 추가했을 수 있으니 관리자에게 알린다.
 *  - 둘 다 개인정보 없는 진단 로그를 남긴다.
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

export type KakaoUnlinkAlert =
    | { kind: "recorded" | "record_failed"; referrerType: KakaoUnlinkReferrer }
    /** user_id 는 정상인데 사유 값을 모를 때. 값은 진단용으로 40자까지만 */
    | { kind: "unknown_referrer"; referrerValue: string };

export type KakaoUnlinkDeps = {
    /** 대표 어드민 키. 없으면 요청을 처리하지 않는다 */
    adminKey: string | undefined;
    /** 새로 기록했으면 true, 같은 미처리 건이 이미 있으면 false(같은 미처리 건에 합침) */
    record: (event: KakaoUnlinkEvent) => Promise<boolean>;
    /** 관리자 알림. 던지지 않는다 */
    alert: (alert: KakaoUnlinkAlert) => Promise<void>;
    /** 응답 뒤에 실행한다(Next after). 카카오의 3초 응답 제한을 지키기 위함이다 */
    defer: (task: () => Promise<void>) => void;
    /** 기록 실패 후 다시 시도하기 전 대기(ms). 기본 0.5초, 2초 */
    retryDelaysMs?: number[];
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

function errorCode(error: unknown): string {
    return error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "unknown";
}

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function handleKakaoUnlink(
    request: Request,
    deps: KakaoUnlinkDeps,
): Promise<Response> {
    const ok = () => new Response(null, { status: 200, headers: NO_STORE });
    const key = deps.adminKey?.trim();
    if (!key) return new Response(null, { status: 503, headers: NO_STORE });

    const authorization = request.headers.get("authorization") ?? "";
    if (!sameSecret(authorization, `KakaoAK ${key}`))
        return new Response(null, { status: 401, headers: NO_STORE });

    const params = await readParams(request);
    const event = parseKakaoUnlink(params);
    if (!event) {
        const referrerValue = (params.get("referrer_type") ?? "").slice(0, 40);
        const userIdValid = /^[0-9]{1,20}$/.test(params.get("user_id") ?? "");
        // 사유 값만 남긴다(회원번호는 빼고).
        console.error(
            "[kakao-unlink] 형식 거절:",
            JSON.stringify(referrerValue),
            userIdValid ? "user_id 정상" : "user_id 형식 오류",
        );
        if (userIdValid)
            deps.defer(() =>
                deps.alert({ kind: "unknown_referrer", referrerValue }),
            );
        return ok();
    }

    try {
        if (await deps.record(event))
            deps.defer(() =>
                deps.alert({
                    kind: "recorded",
                    referrerType: event.referrerType,
                }),
            );
        return ok();
    } catch (error) {
        console.error(
            "[kakao-unlink] 기록 실패:",
            event.referrerType,
            errorCode(error),
        );
    }

    // 기록 실패도 200 으로 답한다. 카카오가 웹훅을 끄지 않게 하기 위함이다.
    // 응답 뒤에 다시 기록해 본다. 일시 장애라면 여기서 남는다.
    deps.defer(async () => {
        for (const delay of deps.retryDelaysMs ?? [500, 2000]) {
            await sleep(delay);
            try {
                if (await deps.record(event))
                    await deps.alert({
                        kind: "recorded",
                        referrerType: event.referrerType,
                    });
                return;
            } catch (error) {
                console.error(
                    "[kakao-unlink] 재시도 기록 실패:",
                    event.referrerType,
                    errorCode(error),
                );
            }
        }
        await deps.alert({
            kind: "record_failed",
            referrerType: event.referrerType,
        });
    });
    return ok();
}

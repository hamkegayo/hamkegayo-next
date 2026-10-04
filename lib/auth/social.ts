export const SOCIAL_PROVIDERS = {
    kakao: "kakao",
    naver: "custom:naver",
} as const;

export type SocialProvider = keyof typeof SOCIAL_PROVIDERS;

// 인증 메일 발송 문제 해결 및 실제 로그인 검증 후 다시 활성화한다.
export const NAVER_LOGIN_ENABLED = false;

export const NAVER_USERINFO_PATH = "/api/auth/naver/userinfo";

export function safeInternalPath(value: string | null | undefined): string {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

    try {
        const url = new URL(value, "https://www.hamkegayo.kr");
        if (url.origin !== "https://www.hamkegayo.kr") return "/";
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return "/";
    }
}

export function isSocialProvider(value: string): value is SocialProvider {
    return value === "kakao" || value === "naver";
}

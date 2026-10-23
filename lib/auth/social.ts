export const SOCIAL_PROVIDERS = {
    kakao: "kakao",
    naver: "custom:naver",
} as const;

export type SocialProvider = keyof typeof SOCIAL_PROVIDERS;

// 제공자 설정과 실계정 로그인 검증을 마친 환경에서만 켠다. 스테이징만 true로 두고
// 운영은 비워 둔다(운영 Supabase에 네이버 provider가 생기기 전까지 꺼 둔다).
// NEXT_PUBLIC_ 값은 빌드 때 번들에 들어가므로 바꾼 뒤에는 재배포해야 한다.
export const NAVER_LOGIN_ENABLED =
    process.env.NEXT_PUBLIC_NAVER_LOGIN_ENABLED === "true";

/** 카카오는 항상 열려 있고 네이버는 위 환경변수로 켠 환경에서만 연다. */
export function isSocialProviderEnabled(
    provider: SocialProvider,
    naverEnabled = NAVER_LOGIN_ENABLED,
) {
    return provider !== "naver" || naverEnabled;
}

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

export const SOCIAL_PROVIDERS = {
    kakao: "kakao",
    naver: "custom:naver",
} as const;

export type SocialProvider = keyof typeof SOCIAL_PROVIDERS;

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

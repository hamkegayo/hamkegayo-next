export const OAUTH_ERRORS = {
    missing_code: "로그인 응답이 올바르지 않습니다. 다시 시도해 주세요.",
    exchange_failed: "소셜 로그인 확인에 실패했습니다. 다시 시도해 주세요.",
    profile_check_failed:
        "회원 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    account_unavailable: "이용할 수 없는 계정입니다. 고객센터에 문의해 주세요.",
    email_required: "소셜 계정의 이메일 제공 동의가 필요합니다.",
    email_verification_required:
        "이메일 주소 확인이 필요합니다. 받은 편지함의 인증 메일을 확인한 뒤 다시 로그인해 주세요.",
    access_denied: "소셜 로그인이 취소되었습니다. 다시 시도해 주세요.",
    provider_failed:
        "소셜 로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요. 계속 실패하면 고객센터에 문의해 주세요.",
} as const;

export type OAuthErrorCode = keyof typeof OAUTH_ERRORS;

export function knownOAuthError(
    value: string | null | undefined,
): OAuthErrorCode | null {
    if (!value) return null;
    return Object.hasOwn(OAUTH_ERRORS, value)
        ? (value as OAuthErrorCode)
        : "provider_failed";
}

/** 원본 오류 문구를 화면·URL에 그대로 노출하지 않고 허용된 코드로 분류한다. */
export function providerOAuthError(
    params: URLSearchParams,
): OAuthErrorCode | null {
    const error = params.get("error");
    const code = params.get("error_code");
    if (!error && !code) return null;
    if (error === "access_denied" || code === "access_denied")
        return "access_denied";
    if (code === "provider_email_needs_verification")
        return "email_verification_required";
    if (
        code === "email_address_not_provided" ||
        params
            .get("error_description")
            ?.includes("Error getting user email from external provider")
    )
        return "email_required";
    return "provider_failed";
}

export function oauthErrorFromLocation(
    search: string,
    hash: string,
): OAuthErrorCode | null {
    const query = new URLSearchParams(search);
    return (
        providerOAuthError(new URLSearchParams(hash.replace(/^#/, ""))) ??
        providerOAuthError(query) ??
        knownOAuthError(query.get("oauth_error"))
    );
}

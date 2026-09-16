export const PARTNER_INTRO_MAX_LENGTH = 300;

export const PARTNER_INTRO_MAX_LENGTH_MESSAGE = `자기소개는 ${PARTNER_INTRO_MAX_LENGTH}자 이하로 입력해 주세요.`;

export const PARTNER_EMAIL_IN_USE_MESSAGE = "이미 사용 중인 이메일입니다.";
export const PARTNER_EMAIL_CHANGE_ERROR_MESSAGE =
    "이메일 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.";

export function isValidPartnerIntro(intro: string): boolean {
    return intro.length <= PARTNER_INTRO_MAX_LENGTH;
}

export function getPartnerEmailChangeErrorMessage(errorCode?: string): string {
    return errorCode === "23505"
        ? PARTNER_EMAIL_IN_USE_MESSAGE
        : PARTNER_EMAIL_CHANGE_ERROR_MESSAGE;
}

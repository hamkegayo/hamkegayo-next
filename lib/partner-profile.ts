export const PARTNER_INTRO_MAX_LENGTH = 300;

export const PARTNER_INTRO_MAX_LENGTH_MESSAGE = `자기소개는 ${PARTNER_INTRO_MAX_LENGTH}자 이하로 입력해 주세요.`;

export function isValidPartnerIntro(intro: string): boolean {
    return intro.length <= PARTNER_INTRO_MAX_LENGTH;
}

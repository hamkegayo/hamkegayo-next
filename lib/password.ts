/**
 * 비밀번호 규칙 — 회원가입·파트너 활성화·비밀번호 재설정이 공유한다.
 *
 *  전에는 회원가입 스키마 안에만 있었다. 재설정을 붙이면서 같은 규칙을 한 벌 더
 *  적게 되는데, 두 벌이 되면 한쪽만 강해지거나 약해져도 아무도 모른다.
 *
 *  정규식 대신 문자 목록으로 둔다 — 문자클래스 안에서 이스케이프해야 하는
 *  기호가 많아 한 글자만 어긋나도 조용히 규칙이 달라진다.
 */

/** 허용하는 특수문자 */
const SPECIAL_CHARS = "!@#$%^&*(),.?\":{}|<>[]~`_-+=;'/\\";

export const PASSWORD_RULE_MESSAGE = "8자 이상, 특수문자를 포함해 주세요.";

/** 8자 이상 + 특수문자 1개 이상 */
export function isValidPassword(v: string): boolean {
    return v.length >= 8 && [...v].some((c) => SPECIAL_CHARS.includes(c));
}

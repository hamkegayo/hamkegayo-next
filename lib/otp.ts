import { createHash } from "crypto";

/** OTP 유효 시간 (5분) */
export const CODE_TTL_MS = 5 * 60 * 1000;
/** 최대 검증 시도 횟수 */
export const MAX_ATTEMPTS = 5;
/** 재발송 쿨다운 (60초) */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** 인증 완료 후 회원가입에서 신뢰하는 유효 시간 (30분) */
export const VERIFIED_VALID_MS = 30 * 60 * 1000;

/** 6자리 숫자 OTP 생성 */
export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** OTP 해시 (원문 대신 저장/비교용) */
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** 휴대폰번호 정규화 — 숫자만 남김 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/** 국내 휴대폰번호 형식 검증 (010XXXXXXXX) */
export function isValidPhone(phone: string): boolean {
  return /^010\d{8}$/.test(phone);
}

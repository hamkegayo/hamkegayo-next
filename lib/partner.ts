/** 파트너 아이디 → 내부 인증용 합성 이메일 (Supabase Auth 통합용) */
export function partnerEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@partner.hamkegayo.internal`;
}

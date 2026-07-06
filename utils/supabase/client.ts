import { createBrowserClient } from "@supabase/ssr";

/**
 * 클라이언트 전용 Supabase 클라이언트를 생성.
 * @returns 브라우저 환경에서 Supabase 클라이언트 환경변수를 넘김
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, //(!는 타입스크립트에게 이 값이 null이나 undefined가 아님을 알려주는 연산자)
  );
}

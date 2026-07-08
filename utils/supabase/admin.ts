import { createClient } from "@supabase/supabase-js";

/**
 * service_role 키를 사용하는 관리자 전용 Supabase 클라이언트.
 * RLS 를 우회하므로 반드시 **서버 환경(서버 액션/route handler)** 에서만 사용할 것.
 * 세션을 저장하지 않아 요청마다 독립적으로 동작한다.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

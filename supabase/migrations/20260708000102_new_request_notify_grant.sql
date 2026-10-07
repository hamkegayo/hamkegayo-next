-- =============================================================
-- 새 요청 알림 함수 서버 실행 권한 명시 — #255-4, PR #274 리뷰
--
--  notify_partners_new_request 는 앱 서버가 service role 클라이언트(createAdminClient)로 부른다.
--  마이그레이션 100 은 public·anon·authenticated 권한만 회수하고 service_role 에는 명시적으로 주지 않았다.
--  지금은 Supabase 기본 권한(default privileges)으로 service_role 에 실행 권한이 붙어 있지만,
--  그 설정에 기대지 않도록 명시한다. 권한이 없으면 호출부가 오류를 기록만 하고 넘어가
--  인앱 알림·메일이 모두 조용히 누락된다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

grant execute on function public.notify_partners_new_request(uuid, text, text, text) to service_role;

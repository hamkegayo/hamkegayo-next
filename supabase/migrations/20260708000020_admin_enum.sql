-- =============================================================
-- user_role 에 ADMIN 추가 — #50
--
--  ⚠️ 이 파일은 enum 값 추가만 한다. 나머지는 20260708000021_admin_role.sql 에 있다.
--     postgres 는 'ADMIN' 을 추가한 트랜잭션 안에서 그 값을 사용하지 못한다.
--     (ALTER TYPE ... ADD VALUE 는 커밋 후에야 쓸 수 있다)
--     한 파일에 합치면 is_admin() 생성 시점에 "unsafe use of new value" 로 실패한다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

alter type public.user_role add value if not exists 'ADMIN';

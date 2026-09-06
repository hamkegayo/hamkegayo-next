-- =============================================================
-- 탈퇴 상태값 추가 (#72)
--
--  ⚠️ 이 파일은 enum 값 추가만 한다. 나머지는
--     20260708000038_member_withdrawal.sql 에 있다.
--     postgres 는 'WITHDRAWN' 을 추가한 트랜잭션 안에서 그 값을 쓰지 못한다
--     (ALTER TYPE ... ADD VALUE 는 커밋 후에야 사용 가능).
--     한 파일에 합치면 withdraw_member() 생성 시점에
--     "unsafe use of new value" 로 실패한다. 20번 마이그레이션과 같은 이유다.
--
--  기존 게이트가 그대로 막아 준다 — 미들웨어·RLS·RPC 가 이미
--  `status = 'ACTIVE'` 를 요구하므로, WITHDRAWN 은 별도 분기 없이
--  모든 경로에서 걸러진다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

alter type public.account_status add value if not exists 'WITHDRAWN';

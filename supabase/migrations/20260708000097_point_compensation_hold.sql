-- =============================================================
-- 귀책 보상 지급 운영 보류 — #250, PR #258 리뷰
--
--  사용자 결정 2026-10-07
--   - 보상은 별도 프로모션·결제 1% 적립 외에는 보류한다. 보상 절차는 운영하며 정한다.
--   - 지급 대상 범위·실명 노출은 리스크를 줄이는 쪽으로 다시 정한다(미정).
--
--  94·95 의 테이블·함수는 남기고(스테이징 적용분과 이력을 맞춘다) 실행 권한만 회수한다.
--  관리자 화면·액션도 COMPENSATION_ENABLED=false 로 닫혀 있다.
--  다시 열 때: 지급 범위·실명 노출 결정을 반영한 뒤 아래 4개 함수에 authenticated 실행 권한을 되돌린다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

revoke all on function public.admin_compensation_target(text)
  from public, anon, authenticated;
revoke all on function public.admin_grant_compensation(uuid, text, integer, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.admin_revoke_compensation(uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_list_compensations(integer)
  from public, anon, authenticated;

comment on table public.point_compensations is
  '귀책 보상 포인트 지급·회수 이력 (#250). 2026-10-07 운영 보류 — 관리자 함수 실행 권한 회수(마이그레이션 97).';

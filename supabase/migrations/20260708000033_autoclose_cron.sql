-- =============================================================
-- 종료 누락 자동 마감을 정기 배치에 연결 (#55 · #65)
--
--  auto_close_stale_services() 는 #55 에서 만들었지만 **아무도 부르지
--  않고 있었다.** #65 의 pg_cron 배치가 다른 브랜치에 있어 연결을 미뤘고,
--  둘 다 머지된 지금 붙인다.
--
--  이게 없으면 파트너가 종료를 잊었을 때 연장 요금이 계속 쌓인다.
--  마감 시각이 예정 종료시각이라 늦게 돌아도 청구액은 같지만,
--  그 사이 화면에는 "진행 중" 으로 남아 파트너·고객 모두 혼란스럽다.
-- =============================================================

create or replace function public.run_expiry_sweep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
  expired  integer;
  closed   integer;
begin
  released := public.release_expired_selections();
  expired  := public.expire_past_matchings();
  -- 예정 종료 +3시간 또는 당일 18시(약관 제13조 ③④) 중 이른 쪽이 지난 건.
  closed   := public.auto_close_stale_services();

  return jsonb_build_object(
    'released', released,
    'expired', expired,
    'closed', closed,
    'at', now()
  );
end;
$$;

comment on function public.run_expiry_sweep() is
  '만료 정리 배치 진입점. pg_cron 이 5분마다 호출한다. 파트너 선택 해제 · 진료일시 경과 취소 · 종료 누락 마감을 함께 처리하고 {released, expired, closed, at} 을 반환한다.';

revoke all on function public.run_expiry_sweep() from public;
revoke all on function public.run_expiry_sweep() from anon, authenticated;

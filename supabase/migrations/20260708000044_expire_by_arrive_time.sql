-- =============================================================
-- 매칭 만료 기준을 arrive_time 으로 통일
--
--  기준이 두 개였다.
--    expire_past_matchings   → reserve_time (병원 진료 예약시간)
--    reservation_start_at    → arrive_time  (파트너 도착 희망시간)
--
--  reservation_start_at 은 파트너 선택(select_reservation_partner)의 소프트
--  홀드, 시작 버튼의 "예약시각 전 거절", 자동 마감의 예정 종료시각 계산까지
--  **서비스 시작 시각**으로 쓰인다. 만료만 다른 값을 보고 있었다.
--
--  arrive_time 이 reserve_time 보다 이르므로, 통일하면 만료가 조금 더 일찍
--  걸린다. 그것이 맞다 — 파트너가 도착해 있어야 할 시각이 지났는데 아직
--  파트너가 정해지지 않았다면 그 예약은 수행될 수 없다.
--
--  계산식을 인라인으로 다시 적지 않고 reservation_start_at 을 부른다.
--  두 벌로 두면 한쪽만 고쳐진다 — 이 사고가 정확히 그것이었다.
--
--  ⚠️ 함수 본문만 바뀐다. 스케줄(expiry-sweep)과 진입점(run_expiry_sweep)은
--     그대로다.
-- =============================================================

create or replace function public.expire_past_matchings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  with expired as (
    update public.reservations
       set status = 'CANCELLED'
     where status = 'MATCHING'
       and arrive_time ~ '\d'
       and public.reservation_start_at(use_date, arrive_time) < now()
    returning id, customer_id
  ), notified as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select e.customer_id,
           'RESERVATION_CANCELLED',
           '서비스 시작 시각이 지나 예약이 취소되었어요',
           '파트너가 정해지지 않은 채 서비스 시작 예정시각이 지나 예약이 자동으로 취소되었습니다.',
           '/mypage/reservations/' || e.id::text
      from expired e
    returning 1
  )
  select count(*)::integer into affected from expired;

  return affected;
end;
$$;

comment on function public.expire_past_matchings() is
  '파트너 미정 상태로 서비스 시작 예정시각(arrive_time)이 지난 매칭을 취소하고 이용자에게 알린다. 기준은 reservation_start_at 하나로 통일한다.';

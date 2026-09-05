-- =============================================================
-- 만료 처리에 고객 알림 추가 (#65)
--
--  두 만료 함수 모두 조용히 상태만 바꾸고 고객에게 아무 말도 하지 않았다.
--    · 결제 기한 만료 → "결제하려고 돌아왔더니 파트너가 사라짐"
--    · 진료일시 경과  → "예약이 말없이 없어짐"
--  둘 다 사용자가 원인을 알 수 없는 변화라 알림이 필요하다.
--
--  스케줄(pg_cron)은 다음 마이그레이션에서 건다. 확장 설치는 환경에 따라
--  실패할 수 있어 분리했다 — 여기까지만 적용돼도 lazy 폴백은 그대로 돈다.
-- =============================================================

-- ---------- ① 결제 기한 만료 — 파트너 선택 해제 ----------
create or replace function public.release_expired_selections()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  -- 해제와 알림을 한 문장으로 묶는다. 두 문장으로 나누면 사이에서 실패했을 때
  -- 해제는 됐는데 알림은 안 간 상태가 남는다.
  -- (WITH 안의 데이터 변경 구문은 참조 여부와 무관하게 정확히 한 번 실행된다)
  with released as (
    update public.reservations
       set confirmed_partner_id = null,
           payment_deadline = null
     where status = 'MATCHING'::public.reservation_status
       and payment_deadline is not null
       and payment_deadline <= now()
    returning id, customer_id
  ), notified as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select r.customer_id,
           'PAYMENT_EXPIRED',
           '결제 시간이 지나 파트너 선택이 해제되었어요',
           '30분 안에 결제가 완료되지 않아 선택이 해제되었습니다. 지원한 파트너가 남아 있으면 다시 선택할 수 있어요.',
           '/mypage/reservations/' || r.id::text
      from released r
    returning 1
  )
  select count(*)::integer into affected from released;

  return affected;
end;
$$;

comment on function public.release_expired_selections() is
  '결제 기한(30분)이 지난 파트너 선택을 해제하고 고객에게 알린다. 지원건(ACCEPTED)은 유지되어 재선택 가능. 해제 건수 반환.';

-- ---------- ② 진료일시 경과 — 미확정 예약 취소 ----------
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
       and reserve_time ~ '\d'
       and (
         (
           use_date::date
           + make_time(
               (regexp_match(reserve_time, '(\d{1,2})'))[1]::int,
               coalesce(
                 (regexp_match(reserve_time, '\d{1,2}\D+(\d{1,2})'))[1]::int,
                 0
               ),
               0
             )
         ) at time zone 'Asia/Seoul'
       ) < now()
    returning id, customer_id
  ), notified as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select e.customer_id,
           'RESERVATION_CANCELLED',
           '진료일시가 지나 예약이 취소되었어요',
           '파트너가 정해지지 않은 채 진료 예정일시가 지나 예약이 자동으로 취소되었습니다.',
           '/mypage/reservations/' || e.id::text
      from expired e
    returning 1
  )
  select count(*)::integer into affected from expired;

  return affected;
end;
$$;

comment on function public.expire_past_matchings() is
  '진료일시가 지난 MATCHING 예약을 CANCELLED 로 전환하고 고객에게 알린다. 만료 건수 반환.';

-- ---------- ③ 배치 진입점 ----------
-- 크론이 함수 두 개를 각각 호출하면 스케줄이 둘로 늘고, 한쪽만 실패했을 때
-- 알아채기 어렵다. 하나로 묶고 결과를 함께 반환한다.
create or replace function public.run_expiry_sweep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
  expired  integer;
begin
  released := public.release_expired_selections();
  expired  := public.expire_past_matchings();

  return jsonb_build_object(
    'released', released,
    'expired', expired,
    'at', now()
  );
end;
$$;

comment on function public.run_expiry_sweep() is
  '만료 정리 배치 진입점. pg_cron 이 5분마다 호출한다. {released, expired, at} 반환.';

-- 사용자가 직접 부를 이유가 없다. 크론(postgres)과 service_role 만 쓴다.
revoke all on function public.run_expiry_sweep() from public;
revoke all on function public.run_expiry_sweep() from anon, authenticated;

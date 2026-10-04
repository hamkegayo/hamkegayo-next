-- #176 이용약관 제13조 ③④ — 매일 07:00~19:00, 주말·공휴일 포함.
-- 기존 예약의 예정 종료 및 과청구 방지 원칙은 유지한다(제12조 시각 기록).
create or replace function public.is_service_booking_time(p_time text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_parts text[]; v_minutes integer;
begin
  v_parts := regexp_match(trim(p_time), '^([0-9]{1,2})(:([0-5][0-9])|시\s*([0-5][0-9])분)$');
  if v_parts is null then return false; end if;
  v_minutes := v_parts[1]::integer * 60 + coalesce(v_parts[3], v_parts[4])::integer;
  return v_minutes between 420 and 1140 and v_minutes % 30 = 0;
end;
$$;
revoke all on function public.is_service_booking_time(text) from public, anon, authenticated;

-- 신규 회원 요청은 직접 REST INSERT도 검사한다. 기존 예약 UPDATE와 서버 시드는 소급 검사하지 않는다.
create or replace function public.validate_new_reservation_hours()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
    not public.is_service_booking_time(new.arrive_time)
    or not public.is_service_booking_time(new.reserve_time)
  ) then
    raise exception 'service_hours_out_of_range' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_new_reservation_hours() from public, anon, authenticated;
drop trigger if exists trg_new_reservation_hours on public.reservations;
create trigger trg_new_reservation_hours before insert on public.reservations
  for each row execute function public.validate_new_reservation_hours();

-- 계산을 분리하여 KST 상한 경계를 고정 시각으로 검증한다.
create or replace function public.service_auto_close_after(
  p_started_at timestamptz, p_duration_minutes integer
)
returns timestamptz language sql immutable set search_path = '' as $$
  select greatest(
    p_started_at + make_interval(mins => coalesce(p_duration_minutes, 120)),
    least(
      p_started_at + make_interval(mins => coalesce(p_duration_minutes, 120)) + interval '3 hours',
      (date_trunc('day', p_started_at at time zone 'Asia/Seoul')
        + interval '19 hours') at time zone 'Asia/Seoul'
    )
  );
$$;
revoke all on function public.service_auto_close_after(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.service_auto_close_after(timestamptz, integer) to service_role;

create or replace function public.auto_close_stale_services()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with stale as (
    select s.id,
      s.started_at + make_interval(mins => coalesce(r.duration_minutes, 120)) as planned_end
    from public.services s
    join public.reservations r on r.id = s.reservation_id
    where s.status = 'IN_PROGRESS'::public.service_status
      and s.started_at is not null
      and now() > public.service_auto_close_after(s.started_at, r.duration_minutes)
  ), closing as (
    update public.services s
      set status = 'ENDED'::public.service_status,
          ended_at = stale.planned_end,
          auto_closed_at = now()
    from stale where s.id = stale.id
    returning s.id
  )
  select count(*)::integer into affected from closing;
  return affected;
end;
$$;
comment on function public.auto_close_stale_services() is
  '예정 종료 +3시간을 기본으로 당일 KST 19시를 상한으로 한다. 예정 종료가 상한 이후인 기존 예약을 보호하고 ended_at에는 예정 종료를 기록한다. 서버 전용.';
revoke all on function public.auto_close_stale_services() from public, anon, authenticated;
grant execute on function public.auto_close_stale_services() to service_role;

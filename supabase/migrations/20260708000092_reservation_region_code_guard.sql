-- #232 리뷰 반영: 예약 주소 법정동코드의 신뢰 경계와 주소 검색 호출 제한.
--
-- 1) 코드는 서버가 주소·코드 결합(서명 토큰)을 검증한 뒤 서비스 권한으로만 기록한다.
--    reservations 는 고객이 직접 INSERT·UPDATE 할 수 있으므로(테이블 단위 권한), 일반 사용자 권한으로
--    들어온 코드는 무시한다 — 화면을 우회해 다른 지역 코드를 넣어 엉뚱한 파트너에게 노출시키지 못하게.
-- 2) 존재하지 않는 법정동코드는 거부한다. 리 단위 코드(…xx, 마지막 두 자리)는 읍·면 코드로 올려 본다
--    (partner_activity_regions 는 리를 넣지 않는다).
-- 3) 주소·병원 검색은 승인키 일일 한도를 쓰므로 사용자별 분당 20회·하루 300회로 제한한다.

create or replace function public.guard_reservation_region_codes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.depart_region_code := null;
      new.hospital_region_code := null;
    else
      new.depart_region_code := old.depart_region_code;
      new.hospital_region_code := old.hospital_region_code;
    end if;
    return new;
  end if;
  if (new.depart_region_code is not null and not exists (
        select 1 from public.partner_activity_regions g
        where g.code in (new.depart_region_code, left(new.depart_region_code, 8) || '00')))
     or (new.hospital_region_code is not null and not exists (
        select 1 from public.partner_activity_regions g
        where g.code in (new.hospital_region_code, left(new.hospital_region_code, 8) || '00'))) then
    raise exception 'invalid_region_code' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_reservation_region_codes on public.reservations;
create trigger trg_guard_reservation_region_codes
  before insert or update of depart_region_code, hospital_region_code on public.reservations
  for each row execute function public.guard_reservation_region_codes();

create table public.address_search_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ADDRESS', 'HOSPITAL')),
  minute_start timestamptz not null,
  minute_count integer not null,
  day_start date not null,
  day_count integer not null,
  primary key (user_id, kind)
);
alter table public.address_search_usage enable row level security;
revoke all on public.address_search_usage from public, anon, authenticated;
grant all on public.address_search_usage to service_role;

-- 호출 1회를 기록하고 한도 안이면 true. 분은 서버 시각, 날은 KST 기준.
create function public.consume_address_search_quota(p_kind text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_minute_count integer;
  v_day_count integer;
begin
  if auth.uid() is null or p_kind not in ('ADDRESS', 'HOSPITAL') then
    return false;
  end if;
  insert into public.address_search_usage as u (user_id, kind, minute_start, minute_count, day_start, day_count)
  values (auth.uid(), p_kind, v_minute, 1, v_day, 1)
  on conflict (user_id, kind) do update set
    minute_count = case when u.minute_start = v_minute then u.minute_count + 1 else 1 end,
    minute_start = v_minute,
    day_count = case when u.day_start = v_day then u.day_count + 1 else 1 end,
    day_start = v_day
  returning minute_count, day_count into v_minute_count, v_day_count;
  return v_minute_count <= 20 and v_day_count <= 300;
end;
$$;
revoke all on function public.consume_address_search_quota(text) from public, anon;
grant execute on function public.consume_address_search_quota(text) to authenticated;

-- =============================================================
-- 파트너 새 요청 알림 + 알림 설정 — #255-4
--
--  근거 : 파트너 현장업무 매뉴얼 3장 — 알림 메뉴에서 "새 요청과 업무 관련 알림"을 확인한다.
--         지금은 파트너가 새 요청 알림을 전혀 받지 않고 수락 대기 목록을 새로 고칠 뿐이었다.
--  사용자 결정 2026-10-07 : 활동 지역·가능 시간(#226)에 맞는 새 요청이 오면 인앱 알림을 보내고,
--         이메일 알림은 켜고 끌 수 있게 한다. 이메일 기본값은 켜짐.
--
--  대상 판정 (서버에서만, 참·거짓)
--   - 활성 파트너이고 활동 지역을 하나 이상 정했으며, 출발지 또는 병원이 그 지역에 든다
--     (partner_open_reservation_matches 와 같은 기준 — 법정동코드 우선, 없으면 주소 토큰 비교)
--   - 이용일의 요일 구분(평일 / 토요일 / 일요일·공휴일) 가능 시간 안에 파트너 도착 희망시각이 든다.
--     공휴일 판정은 앱(lib/holidays)이 하고 p_day_kind 로 넘긴다.
--   - 활동 지역·시간을 정하지 않은 파트너에게는 보내지 않는다(놓치는 쪽이 잘못 보내는 쪽보다 낫다).
--  알림 문구에는 이용자 개인정보를 넣지 않는다 — 일시·상품·병원 시·군·구 수준(단계 1 목록에 이미 있는 정보).
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- 알림 설정 ----------
create table if not exists public.partner_notification_prefs (
  partner_id        uuid primary key references public.partner_accounts (profile_id) on delete cascade,
  email_new_request boolean not null default true,
  updated_at        timestamptz not null default now()
);

comment on table public.partner_notification_prefs is
  '파트너 알림 설정(#255). 행이 없으면 기본값(새 요청 이메일 켜짐)을 쓴다.';

alter table public.partner_notification_prefs enable row level security;
revoke all on public.partner_notification_prefs from public, anon, authenticated;
grant select on public.partner_notification_prefs to authenticated;

drop policy if exists partner_notification_prefs_own on public.partner_notification_prefs;
create policy partner_notification_prefs_own on public.partner_notification_prefs
  for select to authenticated using (partner_id = auth.uid());

create or replace function public.set_my_partner_notification_prefs(p_email_new_request boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.partner_accounts a join public.profiles p on p.id = a.profile_id
     where a.profile_id = auth.uid() and p.role = 'PARTNER'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_email_new_request is null then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  insert into public.partner_notification_prefs (partner_id, email_new_request)
  values (auth.uid(), p_email_new_request)
  on conflict (partner_id) do update
     set email_new_request = excluded.email_new_request, updated_at = now();
end;
$$;
revoke all on function public.set_my_partner_notification_prefs(boolean) from public, anon;
grant execute on function public.set_my_partner_notification_prefs(boolean) to authenticated;

-- ---------- 새 요청 알림 ----------
-- 서버 전용. 인앱 알림을 넣고, 이메일을 보낼 파트너의 주소를 돌려준다(발송은 앱).
create or replace function public.notify_partners_new_request(
  p_reservation uuid,
  p_day_kind    text,
  p_title       text,
  p_body        text
)
returns table (partner_id uuid, email text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_res    public.reservations;
  v_arrive time;
begin
  if p_day_kind is null or p_day_kind not in ('WEEKDAY', 'SATURDAY', 'HOLIDAY') then
    raise exception 'invalid_day_kind' using errcode = '22023';
  end if;

  select * into v_res from public.reservations
   where id = p_reservation and status = 'MATCHING'::public.reservation_status;
  if not found then
    return;
  end if;

  -- arrive_time 은 "9시 30분" / "09:30" 등으로 저장된다 — 숫자 두 개를 뽑아 만든다(마이그레이션 18·32 와 같은 방식).
  v_arrive := make_time(
    least((regexp_match(v_res.arrive_time, '(\d{1,2})'))[1]::int, 23),
    least(coalesce((regexp_match(v_res.arrive_time, '\d{1,2}\D+(\d{1,2})'))[1]::int, 0), 59),
    0);

  return query
  with targets as (
    select ap.partner_id, p.email
      from public.partner_activity_profiles ap
      join public.profiles p on p.id = ap.partner_id
     where p.role = 'PARTNER' and p.status = 'ACTIVE'
       and cardinality(ap.regions) > 0
       and (
         coalesce(public.partner_activity_region_covers(ap.regions, v_res.depart_region_code), false)
         or coalesce(public.partner_activity_region_covers(ap.regions, v_res.hospital_region_code), false)
         or (v_res.depart_region_code is null
             and public.partner_activity_address_matches(ap.regions, v_res.depart_address))
         or (v_res.hospital_region_code is null
             and public.partner_activity_address_matches(ap.regions, v_res.hospital_address))
       )
       and case p_day_kind
             when 'WEEKDAY'  then v_arrive between ap.weekday_start  and ap.weekday_end
             when 'SATURDAY' then v_arrive between ap.saturday_start and ap.saturday_end
             else                 v_arrive between ap.holiday_start  and ap.holiday_end
           end
  ),
  inserted as (
    insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
    select t.partner_id, 'NEW_REQUEST', p_title, p_body,
           '/partner/requests/' || v_res.id::text,
           'new-request:' || v_res.id::text
      from targets t
    on conflict (recipient_id, dedupe_key) do nothing
    returning recipient_id
  )
  select i.recipient_id, t.email
    from inserted i
    join targets t on t.partner_id = i.recipient_id
    left join public.partner_notification_prefs np on np.partner_id = i.recipient_id
   where coalesce(np.email_new_request, true)
     and nullif(trim(t.email), '') is not null;
end;
$$;

comment on function public.notify_partners_new_request(uuid, text, text, text) is
  '새 매칭 요청을 활동 지역·가능 시간이 맞는 활성 파트너에게 인앱 알림(1회). 이메일 수신 파트너의 주소를 반환. 서버 전용(#255).';

revoke all on function public.notify_partners_new_request(uuid, text, text, text)
  from public, anon, authenticated;

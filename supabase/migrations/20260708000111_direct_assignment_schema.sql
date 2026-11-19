-- =============================================================
-- 선결제 후 운영자 직접 배정 흐름 (#300) 1/4 — 스키마·접근 차단·만료 보호
--
--  기존 흐름(legacy_auto) : 신청 → 파트너 지원 → 고객 선택 → 결제 → 확정
--  신규 흐름(admin_direct): 신청 → 선결제(미배정) → 매칭 대기(운영자 접수) → 운영자 직접 배정 → 확정
--
--  ⚠️ 약관 대조 (구현 우선, 추후 정책 개선 예정 — 사용자 확정 2026-11-19)
--     이 변경은 이용약관 제9조 ④⑤ ("파트너 선택 후 선결제·예약 확정")과 순서가 달라진다.
--     또한 아래 세 가지는 현재 공개 약관 원문에 근거 조항이 없다. 출시 전 개정·고지가 필요하다.
--       · 배정 전 고객 취소·운영자 매칭 실패 시 전액 환불 (제19조 취소수수료 표와 별개)
--       · 운영자의 파트너 직접 배정·서비스 시작 전 재배정
--       · 신규 접수 사실의 운영자 이메일 알림 (처리방침 제6조 위탁 범위 확인 필요)
--     파트너 개인정보 접근(처리방침 제5조 ②③, 제9조 ② ④)은 바꾸지 않는다:
--     미배정·이전 담당 파트너는 단계 2 정보를 볼 수 없고, 열람 기간은 partner_can_access 가 그대로 정한다.
--
--  원칙
--   · 기존 예약은 matching_mode = 'legacy_auto' 로 남아 지원·선택·결제·만료 처리가 100% 그대로다.
--     자동매칭 코드는 삭제하지 않는다.
--   · admin_direct 예약은 파트너 알림·지원·고객 선택을 DB 에서도 막는다(아래 가드).
--   · "결제 완료·매칭 대기" = status MATCHING + paid_at 있음. "확정" = status CONFIRMED + 파트너 배정.
--     status enum 은 늘리지 않는다 — 기존 화면·쿼리의 상태 판정을 건드리지 않기 위해서다.
--   · 새 예약의 방식은 서버가 정한다(피처 플래그 — lib/direct-assignment.ts). 고객 권한으로는 바꿀 수 없다.
-- =============================================================

-- ---------- 예약 컬럼 ----------
alter table public.reservations
  add column if not exists matching_mode text not null default 'legacy_auto',
  add column if not exists paid_at timestamptz,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references public.profiles (id) on delete set null,
  -- 파트너가 운영자에게 외부 연락(전화 등)으로 수락 의사를 밝힌 기록. 기록한 사람은 운영자다.
  add column if not exists partner_accepted_at timestamptz,
  add column if not exists partner_accepted_channel text,
  add column if not exists partner_accepted_memo text,
  -- 배정된 파트너가 고객에게 직접 확정 안내 문자를 보냈다는 완료 기록 (자동 발송 아님)
  add column if not exists customer_notice_at timestamptz,
  add column if not exists customer_notice_by uuid references public.profiles (id) on delete set null,
  add column if not exists customer_notice_memo text,
  -- 매칭 실패 처리(운영자) 와 고객 안내 완료 기록
  add column if not exists match_failed_at timestamptz,
  add column if not exists match_failed_by uuid references public.profiles (id) on delete set null,
  add column if not exists match_failure_reason text,
  add column if not exists failure_notice_at timestamptz,
  add column if not exists failure_notice_by uuid references public.profiles (id) on delete set null,
  add column if not exists failure_notice_memo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_matching_mode_chk') then
    alter table public.reservations
      add constraint reservations_matching_mode_chk
      check (matching_mode in ('legacy_auto', 'admin_direct'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_direct_paid_chk') then
    -- 결제 완료 시각은 신규 방식에만 쓴다. 기존 방식은 confirm_reservation_payment 가 CONFIRMED 로 보낸다.
    alter table public.reservations
      add constraint reservations_direct_paid_chk
      check (paid_at is null or matching_mode = 'admin_direct');
  end if;
end $$;

comment on column public.reservations.matching_mode is
  '처리 방식. legacy_auto = 파트너 지원·고객 선택 후 결제(기존), admin_direct = 선결제 후 운영자 직접 배정(#300). 생성 시 서버가 정하며 이후 바뀌지 않는다.';
comment on column public.reservations.paid_at is
  '신규 방식 선결제 승인·저장 완료 시각(매칭 대기 진입). null 이면 결제 전이다.';
comment on column public.reservations.partner_accepted_at is
  '운영자가 외부 연락으로 파트너 수락을 확인해 기록한 시각. 기록한 운영자는 reservation_events 에 남는다.';
comment on column public.reservations.customer_notice_at is
  '배정 파트너가 고객에게 확정 안내 문자를 직접 보냈다고 기록한 시각. 자동 발송이 아니다.';
comment on column public.reservations.match_failed_at is
  '운영자 매칭 실패 처리 시각. 환불 진행 상태는 reservation_refunds 가 따로 관리한다.';

create index if not exists idx_reservations_direct_waiting
  on public.reservations (paid_at)
  where matching_mode = 'admin_direct' and status = 'MATCHING' and paid_at is not null;

-- ---------- 감사 이력 ----------
-- 배정·재배정·수락 확인·문자 안내 완료·매칭 실패·환불·접수 확인을 한 줄씩 남긴다. 추가 전용이다.
create table if not exists public.reservation_events (
  id             bigint generated always as identity primary key,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  event_type     text not null check (event_type in (
    'PAID', 'INTAKE_ACKNOWLEDGED', 'ASSIGNED', 'REASSIGNED', 'CUSTOMER_NOTICE_DONE',
    'MATCH_FAILED', 'FAILURE_NOTICE_DONE', 'REFUND_REQUESTED', 'REFUND_PG_FAILED',
    'REFUND_COMPLETED', 'REFUND_RETRY', 'CUSTOMER_CANCELLED'
  )),
  actor_id       uuid references public.profiles (id) on delete set null,
  actor_role     text,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.reservation_events is
  '신규 방식 예약의 처리 이력(감사). RPC 만 추가하고 수정·삭제하지 않는다. 관리자만 조회한다.';

create index if not exists idx_reservation_events_reservation
  on public.reservation_events (reservation_id, created_at);

-- 관리자 권한. 별도 담당(duty)을 만들기 전까지 정산 담당·전체 담당이 맡는다.
-- 전용 duty 는 계정 발급 화면·제약을 함께 고쳐야 해서 이번 범위에서 만들지 않는다.
create or replace function public.can_manage_reservations()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin_live() and exists (
    select 1 from public.admin_accounts
     where profile_id = auth.uid() and duty in ('전체', '정산')
  );
$$;
revoke all on function public.can_manage_reservations() from public, anon;
grant execute on function public.can_manage_reservations() to authenticated;

alter table public.reservation_events enable row level security;
revoke all on public.reservation_events from anon, authenticated;
grant select on public.reservation_events to authenticated;

drop policy if exists "reservation_events_select_admin" on public.reservation_events;
create policy "reservation_events_select_admin"
  on public.reservation_events for select
  using (public.can_manage_reservations());

-- 이력 한 줄 추가. 다른 security definer 함수에서만 부른다.
create or replace function public.record_reservation_event(
  p_reservation uuid,
  p_type        text,
  p_detail      jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reservation_events (reservation_id, event_type, actor_id, actor_role, detail)
  values (p_reservation, p_type, auth.uid(),
          coalesce(auth.jwt() -> 'app_metadata' ->> 'role', case when auth.uid() is null then 'SYSTEM' end),
          coalesce(p_detail, '{}'::jsonb));
end $$;
revoke all on function public.record_reservation_event(uuid, text, jsonb) from public, anon, authenticated;

-- ---------- 고객 직접 쓰기 차단 ----------
-- reservations_update_own 정책이 고객에게 행 전체 수정을 허용한다. 신규 방식의 처리 컬럼은
-- 서버·RPC(security definer → current_user 가 소유자)만 바꿀 수 있어야 한다.
create or replace function public.guard_direct_assignment_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 고객 권한 INSERT 는 항상 기존 방식이다. 신규 방식 전환은 서버가 서비스 권한으로 기록한다.
    new.matching_mode := 'legacy_auto';
    new.paid_at := null;
    new.assigned_at := null;
    new.assigned_by := null;
    new.partner_accepted_at := null;
    new.partner_accepted_channel := null;
    new.partner_accepted_memo := null;
    new.customer_notice_at := null;
    new.customer_notice_by := null;
    new.customer_notice_memo := null;
    new.match_failed_at := null;
    new.match_failed_by := null;
    new.match_failure_reason := null;
    new.failure_notice_at := null;
    new.failure_notice_by := null;
    new.failure_notice_memo := null;
    return new;
  end if;

  if new.matching_mode is distinct from old.matching_mode
     or new.paid_at is distinct from old.paid_at
     or new.assigned_at is distinct from old.assigned_at
     or new.assigned_by is distinct from old.assigned_by
     or new.partner_accepted_at is distinct from old.partner_accepted_at
     or new.partner_accepted_channel is distinct from old.partner_accepted_channel
     or new.partner_accepted_memo is distinct from old.partner_accepted_memo
     or new.customer_notice_at is distinct from old.customer_notice_at
     or new.customer_notice_by is distinct from old.customer_notice_by
     or new.customer_notice_memo is distinct from old.customer_notice_memo
     or new.match_failed_at is distinct from old.match_failed_at
     or new.match_failed_by is distinct from old.match_failed_by
     or new.match_failure_reason is distinct from old.match_failure_reason
     or new.failure_notice_at is distinct from old.failure_notice_at
     or new.failure_notice_by is distinct from old.failure_notice_by
     or new.failure_notice_memo is distinct from old.failure_notice_memo then
    raise exception 'direct_assignment_columns_server_only' using errcode = '42501';
  end if;

  -- 신규 방식 예약은 고객이 상태·담당 파트너·결제 기한을 직접 바꿀 수 없다.
  -- (취소·환불은 서버 액션과 RPC 가 처리한다.)
  if old.matching_mode = 'admin_direct'
     and (new.status is distinct from old.status
          or new.confirmed_partner_id is distinct from old.confirmed_partner_id
          or new.payment_deadline is distinct from old.payment_deadline) then
    raise exception 'direct_assignment_columns_server_only' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_direct_assignment_columns on public.reservations;
create trigger trg_guard_direct_assignment_columns
  before insert or update on public.reservations
  for each row execute function public.guard_direct_assignment_columns();

-- =============================================================
-- 파트너 알림·지원·고객 선택 차단 (신규 방식)
-- =============================================================

-- ① 매칭 전 검토 단계(partner_in_review)에서 신규 방식 예약을 뺀다.
--    파트너 목록·상세 RPC(partner_list_open_reservations, partner_get_open_reservation 등)가 모두 이 함수를 거친다.
create or replace function public.partner_in_review(res_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.reservations r
     where r.id = res_id
       and r.status = 'MATCHING'::public.reservation_status
       and r.matching_mode = 'legacy_auto'
       and not exists (
         select 1
           from public.reservation_applications a
          where a.reservation_id = r.id
            and a.partner_id = auth.uid()
            and a.status in ('REJECTED'::public.application_status,
                             'NOT_SELECTED'::public.application_status)
       )
  );
$$;

-- ② 지원 생성·수락 전이 차단 (RLS 우회 시도·기존 앱 코드 모두)
create or replace function public.guard_admin_direct_applications()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.reservations r
     where r.id = new.reservation_id and r.matching_mode = 'admin_direct'
  ) then
    raise exception 'admin_direct_no_applications' using errcode = 'P0001',
      hint = '선결제 후 운영자 직접 배정 예약은 파트너 지원·선택을 받지 않는다 (#300)';
  end if;
  return new;
end $$;

drop trigger if exists trg_res_apps_admin_direct_guard on public.reservation_applications;
create trigger trg_res_apps_admin_direct_guard
  before insert or update of status on public.reservation_applications
  for each row execute function public.guard_admin_direct_applications();

-- ③ 고객의 파트너 선택 차단
create or replace function public.select_reservation_partner(
  p_reservation_id uuid,
  p_partner_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_status   public.reservation_status;
  v_mode     text;
  v_start    timestamptz;
  v_end      timestamptz;
  v_deadline timestamptz;
begin
  select customer_id, status, matching_mode,
         public.reservation_start_at(use_date, arrive_time),
         public.reservation_start_at(use_date, arrive_time)
           + make_interval(mins => coalesce(duration_minutes, 120))
    into v_customer, v_status, v_mode, v_start, v_end
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found then raise exception 'reservation_not_found'; end if;
  if v_customer is distinct from auth.uid() then raise exception 'not_owner'; end if;
  if v_mode = 'admin_direct' then raise exception 'admin_direct_no_selection'; end if;
  if v_status <> 'MATCHING'::public.reservation_status then raise exception 'not_matching'; end if;

  if not exists (
    select 1
      from public.reservation_applications
     where reservation_id = p_reservation_id
       and partner_id = p_partner_id
       and status = 'ACCEPTED'::public.application_status
  ) then
    raise exception 'partner_not_applied';
  end if;

  -- 소프트 홀드 : 확정됐거나 결제 대기 중인 다른 예약과 시간대가 겹치면 차단
  if exists (
    select 1
      from public.reservations r
     where r.id <> p_reservation_id
       and r.confirmed_partner_id = p_partner_id
       and (
         r.status = 'CONFIRMED'::public.reservation_status
         or (r.status = 'MATCHING'::public.reservation_status
             and r.payment_deadline > now())
       )
       and (
         public.reservation_start_at(r.use_date, r.arrive_time),
         public.reservation_start_at(r.use_date, r.arrive_time)
           + make_interval(mins => coalesce(r.duration_minutes, 120))
       ) overlaps (v_start, v_end)
  ) then
    raise exception 'partner_unavailable';
  end if;

  v_deadline := now() + interval '30 minutes';

  update public.reservations
     set confirmed_partner_id = p_partner_id,
         payment_deadline = v_deadline
   where id = p_reservation_id;

  return v_deadline;
end;
$$;

revoke all on function public.select_reservation_partner(uuid, uuid) from public, anon;
grant execute on function public.select_reservation_partner(uuid, uuid) to authenticated;

-- ④ 새 요청 알림 대상 제외 — 신규 방식은 파트너에게 알리지 않는다.
--    본문은 100 번 그대로이고 예약 조회 조건에 matching_mode 만 더한다.
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
   where id = p_reservation
     and status = 'MATCHING'::public.reservation_status
     and matching_mode = 'legacy_auto';
  if not found then
    return;
  end if;

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

-- =============================================================
-- 만료 정리 — 신규 방식의 결제 완료(매칭 대기) 건 보호
--
--  기존 정리는 "파트너 미정 + 시작 예정시각 경과" 를 취소한다. 신규 방식은 결제를 마친 뒤
--  파트너가 없는 것이 정상이므로 취소하면 안 된다(돈은 받았는데 예약이 사라진다).
--  24시간이 지나도 자동 실패·환불하지 않고 운영자 경고만 한다(관리자 목록의 overdue 표시).
--
--  · 결제 완료(paid_at 있음) 신규 방식 → 취소하지 않는다
--  · 결제 전 신규 방식 → 기존과 같이 시작 예정시각이 지나면 취소(미결제 만료)
--  · release_expired_selections 는 파트너 선택 해제용이라 신규 방식은 건드리지 않는다
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
       set status = 'CANCELLED',
           cancel_reason = 'EXPIRED',
           cancelled_at = now()
     where status = 'MATCHING'
       and arrive_time ~ '\d'
       and public.reservation_start_at(use_date, arrive_time) < now()
       and not (matching_mode = 'admin_direct' and paid_at is not null)
       -- 승인 진행 중(PENDING 결제)이면 건드리지 않는다 — 승인 직후 매칭 대기로 가야 한다
       and not (matching_mode = 'admin_direct'
                and exists (select 1 from public.payments p
                             where p.reservation_id = reservations.id
                               and p.type = 'BASE' and p.status = 'PENDING'
                               and p.created_at > now() - interval '30 minutes'))
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

create or replace function public.release_expired_selections()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  with released as (
    update public.reservations
       set confirmed_partner_id = null,
           payment_deadline = null
     where status = 'MATCHING'::public.reservation_status
       and matching_mode = 'legacy_auto'
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

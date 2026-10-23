-- =============================================================
-- 소셜 제공자 연결 해제 알림 기록 (#291)
--  - 사용자가 카카오 쪽에서 앱 연결을 끊거나 카카오계정을 탈퇴하면 카카오가
--    연결 해제 웹훅을 보낸다. 우리는 기록하고 관리자에게 알리기만 한다(C안).
--    회원 삭제·탈퇴·identity 해제는 자동으로 하지 않는다. 처리는 운영자가
--    기존 회원탈퇴 절차로 한다.
--  - 같은 이벤트가 재전송돼도 미처리 건은 하나만 남긴다.
--  - 조회·처리는 관리자 RPC 로만 열고 접속기록을 남긴다.
--
-- 개인정보처리방침 제11조 ① — 처리 목적 달성 시 지체 없이 파기(누락 방지 목적)
-- 개인정보처리방침 제12조 ① — 동의철회 요청
-- 개인정보처리방침 제13조 — 접근권한 관리 및 접근통제
-- 기록 보유기간은 방침 원문이 정하지 않아 미정이다(#291).
-- =============================================================

create table if not exists public.social_unlink_events (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null check (provider in ('kakao')),
  -- 제공자 회원번호. Supabase auth.identities.provider_id 와 같은 값.
  provider_user_id text not null check (provider_user_id ~ '^[0-9]{1,20}$'),
  referrer_type    text not null check (referrer_type in (
    'ACCOUNT_DELETE', 'FORCED_ACCOUNT_DELETE', 'UNLINK_FROM_ADMIN',
    'UNLINK_FROM_APPS', 'INCOMPLETE_SIGN_UP'
  )),
  -- 수신 시점에 연결된 회원. 없으면 null(가입 미완료·이미 정리된 계정).
  user_id          uuid references auth.users (id) on delete set null,
  status           text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  memo             text check (memo is null or char_length(btrim(memo)) between 2 and 1000),
  received_at      timestamptz not null default now(),
  check ((status = 'OPEN' and resolved_at is null and resolved_by is null)
      or (status = 'RESOLVED' and resolved_at is not null and memo is not null))
);

comment on table public.social_unlink_events is
  '소셜 제공자 연결 해제 웹훅 기록(#291). 자동 처리하지 않고 관리자가 확인한다. 조회는 관리자 RPC 로만.';

-- 재전송 중복 방지: 미처리 건은 (제공자, 회원번호, 사유)당 하나
create unique index if not exists uq_social_unlink_events_open
  on public.social_unlink_events (provider, provider_user_id, referrer_type)
  where status = 'OPEN';
create index if not exists idx_social_unlink_events_received
  on public.social_unlink_events (received_at desc);

alter table public.social_unlink_events enable row level security;
revoke all on public.social_unlink_events from anon, authenticated;

-- ---------- 적재 — 웹훅 라우트(service_role) 전용 ----------
-- 새로 기록했으면 true, 같은 미처리 건이 이미 있으면 false 를 돌려준다.
create or replace function public.record_social_unlink(
  p_provider         text,
  p_provider_user_id text,
  p_referrer_type    text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_id   uuid;
begin
  select i.user_id into v_user
    from auth.identities i
   where i.provider = p_provider
     and i.provider_id = p_provider_user_id
   limit 1;

  insert into public.social_unlink_events (provider, provider_user_id, referrer_type, user_id)
  values (p_provider, p_provider_user_id, p_referrer_type, v_user)
  on conflict (provider, provider_user_id, referrer_type) where status = 'OPEN' do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

comment on function public.record_social_unlink(text, text, text) is
  '카카오 연결 해제 웹훅 적재(#291). 회원을 찾아 묶어 두기만 하고 회원 데이터는 바꾸지 않는다.';

revoke all on function public.record_social_unlink(text, text, text) from public, anon, authenticated;
grant execute on function public.record_social_unlink(text, text, text) to service_role;

-- ---------- 관리자 홈 요약 ----------
create or replace function public.admin_social_unlink_summary()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select count(*) from public.social_unlink_events where status = 'OPEN');
end;
$$;

comment on function public.admin_social_unlink_summary() is
  '관리자 홈의 미처리 연결 해제 건수(#291). 개인정보를 반환하지 않는다.';

-- ---------- 목록 ----------
create or replace function public.admin_list_social_unlinks(
  p_status text default 'OPEN'
)
returns table (
  id            uuid,
  provider      text,
  referrer_type text,
  status        text,
  user_id       uuid,
  member_name   text,
  member_email  text,
  member_status text,
  memo          text,
  received_at   timestamptz,
  resolved_at   timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('OPEN', 'RESOLVED') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  perform public.log_access('SOCIAL_UNLINK_LIST', 'social_unlink_events');
  return query
  select e.id, e.provider, e.referrer_type, e.status, e.user_id,
         p.name, p.email, p.status::text, e.memo, e.received_at, e.resolved_at
    from public.social_unlink_events e
    left join public.profiles p on p.id = e.user_id
   where p_status is null or e.status = p_status
   order by e.received_at desc
   limit 100;
end;
$$;

comment on function public.admin_list_social_unlinks(text) is
  '연결 해제 기록과 연결된 회원 이름·이메일을 반환하고 관리자 접속기록을 남긴다(#291).';

-- ---------- 처리 완료 ----------
create or replace function public.admin_resolve_social_unlink(
  p_id   uuid,
  p_memo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_memo, ''))) not between 2 and 1000 then
    raise exception 'invalid_memo' using errcode = '22023';
  end if;

  update public.social_unlink_events
     set status = 'RESOLVED', resolved_by = auth.uid(), resolved_at = now(), memo = btrim(p_memo)
   where id = p_id and status = 'OPEN'
  returning user_id into v_user;
  if not found then
    raise exception 'not_open' using errcode = 'P0002';
  end if;

  perform public.log_access('SOCIAL_UNLINK_RESOLVE', 'social_unlink_events', p_id, v_user);
end;
$$;

comment on function public.admin_resolve_social_unlink(uuid, text) is
  '연결 해제 기록을 처리 완료로 바꾸고 접속기록을 남긴다(#291). 회원 데이터는 바꾸지 않는다.';

revoke all on function public.admin_social_unlink_summary() from public, anon;
revoke all on function public.admin_list_social_unlinks(text) from public, anon;
revoke all on function public.admin_resolve_social_unlink(uuid, text) from public, anon;
grant execute on function public.admin_social_unlink_summary() to authenticated;
grant execute on function public.admin_list_social_unlinks(text) to authenticated;
grant execute on function public.admin_resolve_social_unlink(uuid, text) to authenticated;

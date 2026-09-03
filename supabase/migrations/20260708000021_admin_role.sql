-- =============================================================
-- ADMIN 권한 · 접근통제 · 접속기록 — #50
--
--  설계 원칙
--   1. 관리자는 어떤 테이블에도 **직접 쓰기 정책을 갖지 않는다.**
--      쓰기는 전부 security definer RPC 를 거치고, 그 안에서 접속기록을 남긴다.
--   2. 이용자·환자 개인정보가 담긴 테이블은 **조회 정책도 주지 않는다.**
--      필요한 항목만 RPC 로 노출한다. (reservations)
--   3. service_role 우회는 쓰지 않는다. 관리자 권한은 JWT + DB 로만 판정한다.
--
--  근거
--   · 개인정보처리방침 제10조 3 — 개인정보 및 서비스 기록에 대한 접근권한을
--     서비스 운영에 필요한 범위로 제한
--   · 개인정보처리방침 제10조 4 — 데이터베이스 및 스토리지 접근권한을 통해 관리
--   · 「개인정보의 안전성 확보조치 기준」 제5조 ③ — 권한 부여·변경·말소 내역 최소 3년 보관
--   · 같은 고시 제5조 ④ — 개인정보취급자별 계정 발급, 공유 금지
--   · 같은 고시 제8조 ① 2호 — 민감정보 처리 시스템의 접속기록 2년 이상 보관
--     (본 서비스는 처리방침 제4조 ① 에 따라 건강정보를 처리한다)
--   · 같은 고시 제2조 3호 — 접속기록 = 식별자·접속일시·접속지 정보·
--     처리한 정보주체 정보·수행업무
--
--  ⚠️ 관리자가 볼 수 없는 것 (의도된 것이며 정책을 추가하지 말 것)
--     care_recipients · reports · report_attachments · services · notifications
--     · reservation_applications — 이용자 건강정보와 파트너 자유기술이 들어 있다.
--     reservations 는 admin_list_reservations() / admin_get_reservation() 으로만.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- =============================================================
-- 0. 권한 상승 차단 — 본인이 자기 role/status 를 바꾸지 못하게
--
--    기존 profiles_update_own 정책은 컬럼을 제한하지 않아,
--    로그인 토큰만 있으면 PATCH /rest/v1/profiles 로 자기 role 을 바꿀 수 있었다.
--    ADMIN 이 enum 에 들어온 이상 이건 즉시 관리자 승격 경로가 된다.
--
--    RLS 정책은 변경 전 행(old)을 볼 수 없어 컬럼 단위 제어를 못 한다.
--    테이블 UPDATE 권한 자체를 회수하고 안전한 컬럼만 되돌려주는 방식으로 막는다.
--    (컬럼 단위 revoke 는 테이블 단위 grant 를 지우지 못하므로 순서가 중요하다)
--
--    role/status 변경은 아래 admin_grant_role() · admin_set_account_status() 로만.
--    회원가입은 service_role 로 동작하므로 이 회수의 영향을 받지 않는다.
-- =============================================================
revoke update on public.profiles from anon, authenticated;

-- 본인이 고칠 수 있는 것만. phone_verified_at 은 스스로 인증 완료로 만들 수 없도록 제외한다.
grant update (name, email, avatar_path) on public.profiles to authenticated;

-- =============================================================
-- 1. 관리자 판정
--
--    is_admin()      — JWT 클레임만 본다. RLS 정책에서 쓴다(조회 없음).
--    is_admin_live() — profiles 를 다시 읽는다. 쓰기 RPC 에서 쓴다.
--
--    JWT 는 만료 전까지 갱신되지 않아 권한 회수가 최대 1시간 늦게 반영된다.
--    계정·심사·정산처럼 되돌리기 어려운 작업은 is_admin_live() 로 재확인한다.
--
--    두 함수 모두 aal2(2단계 인증 완료)를 요구한다. 토큰이 유출돼도
--    두 번째 요소 없이는 DB 가 거절한다. — 고시 제6조(외부 접속 2차 인증)
-- =============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')   = 'ADMIN'
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'status', '') = 'ACTIVE'
     and coalesce(auth.jwt() ->> 'aal', 'aal1')                  = 'aal2';
$$;

comment on function public.is_admin() is
  'JWT 클레임 기준 관리자 판정(aal2 필수). RLS 정책용. 권한 회수 반영이 최대 1시간 늦다.';

create or replace function public.is_admin_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1
             from public.profiles p
            where p.id     = auth.uid()
              and p.role   = 'ADMIN'::public.user_role
              and p.status = 'ACTIVE'::public.account_status
         )
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

comment on function public.is_admin_live() is
  'profiles 를 다시 읽는 관리자 판정(aal2 필수). 계정·심사·정산 등 쓰기 작업용.';

revoke all on function public.is_admin()      from public, anon;
revoke all on function public.is_admin_live() from public, anon;
grant execute on function public.is_admin()      to authenticated;
grant execute on function public.is_admin_live() to authenticated;

-- =============================================================
-- 2. 관리자 계정 — 고시 제5조 ④ (취급자별 계정 발급, 공유 금지)
--
--    profiles.role = 'ADMIN' 이 권한의 정본이고, 이 테이블은 운영 정보를 담는다.
--    담당 업무를 나눠 권한을 세분화할 때 확장 지점이 된다.
-- =============================================================
create table if not exists public.admin_accounts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  -- 담당 업무 (계정발급 / 자격심사 / 정산 등). 지금은 표시용이고 권한 분기는 하지 않는다.
  duty       text,
  memo       text,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_accounts is
  '관리자 운영 정보. 권한의 정본은 profiles.role 이다. 고시 제5조 ④ 취급자별 계정.';

drop trigger if exists trg_admin_accounts_updated_at on public.admin_accounts;
create trigger trg_admin_accounts_updated_at
  before update on public.admin_accounts
  for each row execute function public.set_updated_at();

-- =============================================================
-- 3. 권한 부여·변경·말소 내역 — 고시 제5조 ③ (최소 3년 보관)
-- =============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_grant_action') then
    create type public.admin_grant_action as enum (
      'GRANT',    -- 관리자 권한 부여
      'REVOKE',   -- 관리자 권한 말소
      'SUSPEND',  -- 계정 정지
      'RESTORE'   -- 정지 해제
    );
  end if;
end $$;

create table if not exists public.admin_role_grants (
  id         uuid primary key default gen_random_uuid(),
  -- 부여자. 최초 관리자는 스크립트로 만들어지므로 null 이다.
  actor_id   uuid references public.profiles (id) on delete set null,
  target_id  uuid not null references public.profiles (id) on delete cascade,
  action     public.admin_grant_action not null,
  reason     text,
  created_at timestamptz not null default now()
);

comment on table public.admin_role_grants is
  '관리자 권한 부여·변경·말소 내역. 고시 제5조 ③ 에 따라 최소 3년 보관한다.';

create index if not exists idx_admin_role_grants_target
  on public.admin_role_grants (target_id, created_at desc);

-- =============================================================
-- 4. 접속기록 — 고시 제8조 ① 2호 (민감정보 처리 시스템: 2년 이상 보관)
--
--    컬럼은 고시 제2조 3호의 정의를 그대로 따른다.
--      식별자          → actor_id
--      접속일시        → occurred_at
--      접속지 정보     → ip
--      처리한 정보주체 → subject_id (+ 비회원 이용자는 target_id 로 추적)
--      수행업무        → action
--
--    ⚠️ 이번 이슈에서는 관리자 액션만 적재한다.
--       고시 제8조 ① 은 '개인정보취급자' 전체를 요구하므로 파트너 조회도 대상이다.
--       파트너 적재는 별도 이슈로 뺀다. (2026-10-31 시행분에서 범위가 더 넓어진다)
--       그래서 테이블 이름을 admin_ 으로 좁히지 않았다.
-- =============================================================
create table if not exists public.access_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid not null references public.profiles (id) on delete cascade,
  actor_role   public.user_role not null,
  occurred_at  timestamptz not null default now(),
  -- 접속지 정보. PostgREST 가 넘겨준 요청 헤더에서 뽑는다.
  ip           text,
  user_agent   text,
  -- 처리한 정보주체(회원). 목록 조회처럼 특정 대상이 없으면 null.
  subject_id   uuid references public.profiles (id) on delete set null,
  action       text not null,
  target_table text,
  target_id    uuid,
  -- 열람 사유. 상세 조회 계열은 필수로 받는다.
  reason       text
);

comment on table public.access_logs is
  '개인정보취급자 접속기록. 고시 제8조 ① 2호(민감정보)에 따라 2년 이상 보관한다.';

create index if not exists idx_access_logs_actor
  on public.access_logs (actor_id, occurred_at desc);
create index if not exists idx_access_logs_subject
  on public.access_logs (subject_id, occurred_at desc)
  where subject_id is not null;
create index if not exists idx_access_logs_occurred
  on public.access_logs (occurred_at desc);

-- ---------- 접속기록 적재 (내부 전용) ----------
-- 다른 security definer 함수 안에서만 부른다. 클라이언트에는 실행 권한을 주지 않는다.
create or replace function public.log_access(
  p_action       text,
  p_target_table text default null,
  p_target_id    uuid default null,
  p_subject_id   uuid default null,
  p_reason       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers json;
  v_ip      text;
  v_ua      text;
  v_role    public.user_role;
begin
  -- 요청 헤더는 PostgREST 경유일 때만 있다. 없으면 조용히 넘어간다.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null then
    v_ip := nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), '');
    v_ua := v_headers ->> 'user-agent';
  end if;

  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role is null then
    return;  -- 세션 없는 호출(트리거·배치)은 기록하지 않는다
  end if;

  insert into public.access_logs
    (actor_id, actor_role, ip, user_agent, subject_id, action, target_table, target_id, reason)
  values
    (auth.uid(), v_role, v_ip, v_ua, p_subject_id, p_action, p_target_table, p_target_id, p_reason);
end;
$$;

comment on function public.log_access(text, text, uuid, uuid, text) is
  '접속기록 1건 적재. 내부 전용 — 다른 security definer 함수에서만 호출한다.';

revoke all on function public.log_access(text, text, uuid, uuid, text)
  from public, anon, authenticated;

-- =============================================================
-- 5. 새 테이블 RLS — 관리자 조회만. 쓰기는 RPC 전용.
-- =============================================================
alter table public.admin_accounts    enable row level security;
alter table public.admin_role_grants enable row level security;
alter table public.access_logs       enable row level security;

-- 정책을 실수로 열어도 쓰기가 되지 않도록 테이블 권한부터 좁힌다.
revoke all on public.admin_accounts    from anon, authenticated;
revoke all on public.admin_role_grants from anon, authenticated;
revoke all on public.access_logs       from anon, authenticated;
grant select on public.admin_accounts    to authenticated;
grant select on public.admin_role_grants to authenticated;
grant select on public.access_logs       to authenticated;

drop policy if exists "admin_accounts_select_admin" on public.admin_accounts;
create policy "admin_accounts_select_admin"
  on public.admin_accounts for select
  using (public.is_admin());

drop policy if exists "admin_role_grants_select_admin" on public.admin_role_grants;
create policy "admin_role_grants_select_admin"
  on public.admin_role_grants for select
  using (public.is_admin());

drop policy if exists "access_logs_select_admin" on public.access_logs;
create policy "access_logs_select_admin"
  on public.access_logs for select
  using (public.is_admin());

-- =============================================================
-- 6. 기존 테이블 관리자 조회 정책
--
--    여는 것은 계정 관리·자격 심사·정산에 필요한 것뿐이다.
--    이용자·환자 개인정보가 있는 테이블은 여기 없다. (파일 상단 주석 참고)
-- =============================================================

-- 계정 관리 — 이름·연락처·이메일이 포함되나 계정 발급이 업무이므로 필요 범위 안이다.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "partner_accounts_select_admin" on public.partner_accounts;
create policy "partner_accounts_select_admin"
  on public.partner_accounts for select
  using (public.is_admin());

-- 자격 심사
drop policy if exists "partner_quals_select_admin" on public.partner_qualifications;
create policy "partner_quals_select_admin"
  on public.partner_qualifications for select
  using (public.is_admin());

-- 정산 — 이용자 개인정보가 없다.
drop policy if exists "settlements_select_admin" on public.settlements;
create policy "settlements_select_admin"
  on public.settlements for select
  using (public.is_admin());

drop policy if exists "payments_select_admin" on public.payments;
create policy "payments_select_admin"
  on public.payments for select
  using (public.is_admin());

drop policy if exists "points_select_admin" on public.points;
create policy "points_select_admin"
  on public.points for select
  using (public.is_admin());

-- =============================================================
-- 7. Storage — 자격 증빙만. 처리방침 제10조 4.
--    report-attachments(처방전·영수증)와 profile-photos 는 열지 않는다.
-- =============================================================
drop policy if exists "partner_qual_select_admin" on storage.objects;
create policy "partner_qual_select_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'partner-qualifications'
    and public.is_admin()
  );

-- =============================================================
-- 8. 예약 조회 RPC — 직접 정책 대신 함수로만 노출
--
--    뷰를 쓰지 않는 이유: select 는 접속기록을 남길 수 없다.
--    고시 제2조 3호가 '처리한 정보주체 정보'를 요구하므로,
--    누가 어떤 예약을 열었는지 적재할 지점이 필요하다.
-- =============================================================

-- 목록 — 개인정보 컬럼(이름·연락처·주소·진료내용)을 아예 반환하지 않는다.
create or replace function public.admin_list_reservations(
  p_status text    default null,
  p_from   date    default null,
  p_to     date    default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id               uuid,
  code             text,
  status           public.reservation_status,
  plan             text,
  use_date         date,
  arrive_time      text,
  duration         text,
  duration_minutes integer,
  prepaid_amount   integer,
  final_amount     integer,
  created_at       timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform public.log_access('RESERVATION_LIST', 'reservations');

  return query
    select r.id, r.code, r.status, r.plan, r.use_date, r.arrive_time,
           r.duration, r.duration_minutes, r.prepaid_amount, r.final_amount,
           r.created_at
      from public.reservations r
     where (p_status is null or r.status = p_status::public.reservation_status)
       and (p_from   is null or r.use_date >= p_from)
       and (p_to     is null or r.use_date <= p_to)
     order by r.created_at desc
     limit  greatest(1, least(coalesce(p_limit, 50), 200))
    offset  greatest(0, coalesce(p_offset, 0));
end;
$$;

comment on function public.admin_list_reservations(text, date, date, integer, integer) is
  '관리자 예약 목록. 개인정보 컬럼은 반환하지 않는다. 조회 시 접속기록을 남긴다.';

-- 상세 — 사유를 받아 접속기록에 남긴다.
create or replace function public.admin_get_reservation(
  p_id     uuid,
  p_reason text
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.reservations;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 사유 없는 개인정보 열람은 받지 않는다
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_row from public.reservations where id = p_id;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  perform public.log_access(
    'RESERVATION_READ', 'reservations', v_row.id, v_row.customer_id, btrim(p_reason)
  );

  return v_row;
end;
$$;

comment on function public.admin_get_reservation(uuid, text) is
  '관리자 예약 상세. 사유가 없으면 거절하고, 열람 사실을 접속기록에 남긴다.';

revoke all on function public.admin_list_reservations(text, date, date, integer, integer)
  from public, anon;
revoke all on function public.admin_get_reservation(uuid, text) from public, anon;
grant execute on function public.admin_list_reservations(text, date, date, integer, integer)
  to authenticated;
grant execute on function public.admin_get_reservation(uuid, text) to authenticated;

-- =============================================================
-- 9. 쓰기 RPC — 계정 · 심사 · 정산
--
--    전부 is_admin_live() 로 재확인한다. JWT 만으로 판정하면
--    권한을 회수당한 관리자가 최대 1시간 동안 계속 승인할 수 있다.
-- =============================================================

-- ---------- 관리자 권한 부여 ----------
--
--  관리자는 **전용 계정으로만** 만든다. 쓰던 이용자·파트너 계정을 승격하지 않는다.
--   · 정산 권한이 붙는 계정을 개인 이용 계정에 얹으면 안 된다 (고시 제5조 ④)
--   · role 이 ADMIN 이 되면 미들웨어가 /admin 밖을 막아 자기 예약도 못 본다
--   · 파트너를 승격하면 partner_accounts 행이 붕 뜬다
--
--  auth 유저 생성은 service_role 만 할 수 있어 여기서 하지 못한다.
--  계정 발급 화면(#56)이 빈 계정을 만든 뒤 이 함수를 부르는 순서가 된다.
create or replace function public.admin_grant_role(
  p_target uuid,
  p_duty   text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = p_target;
  if v_role is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  -- 이미 관리자면 duty 갱신만 하고 넘어간다(아래 upsert). 그 외 이용 이력이 있으면 거절.
  if v_role <> 'ADMIN'::public.user_role then
    if v_role <> 'USER'::public.user_role
       or exists (select 1 from public.reservations     where customer_id = p_target)
       or exists (select 1 from public.partner_accounts where profile_id  = p_target)
       or exists (select 1 from public.points           where user_id     = p_target)
    then
      raise exception 'target_not_dedicated' using errcode = '23514';
    end if;
  end if;

  update public.profiles
     set role = 'ADMIN'::public.user_role
   where id = p_target;

  insert into public.admin_accounts (profile_id, duty, granted_by)
  values (p_target, p_duty, auth.uid())
  on conflict (profile_id) do update
    set duty = coalesce(excluded.duty, public.admin_accounts.duty),
        granted_by = excluded.granted_by,
        granted_at = now();

  insert into public.admin_role_grants (actor_id, target_id, action, reason)
  values (auth.uid(), p_target, 'GRANT', p_reason);

  perform public.log_access('ADMIN_GRANT', 'profiles', p_target, p_target, p_reason);
end;
$$;

-- ---------- 관리자 권한 말소 ----------
create or replace function public.admin_revoke_role(
  p_target uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 마지막 관리자를 지우면 아무도 복구할 수 없다
  if (select count(*) from public.profiles
       where role = 'ADMIN'::public.user_role
         and status = 'ACTIVE'::public.account_status) <= 1 then
    raise exception 'last_admin' using errcode = '23514';
  end if;

  update public.profiles
     set role = 'USER'::public.user_role
   where id = p_target
     and role = 'ADMIN'::public.user_role;
  if not found then
    raise exception 'not_an_admin' using errcode = 'P0002';
  end if;

  delete from public.admin_accounts where profile_id = p_target;

  insert into public.admin_role_grants (actor_id, target_id, action, reason)
  values (auth.uid(), p_target, 'REVOKE', p_reason);

  perform public.log_access('ADMIN_REVOKE', 'profiles', p_target, p_target, p_reason);
end;
$$;

-- ---------- 계정 상태 변경 ----------
create or replace function public.admin_set_account_status(
  p_target uuid,
  p_status public.account_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.profiles set status = p_status where id = p_target;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  insert into public.admin_role_grants (actor_id, target_id, action, reason)
  values (
    auth.uid(), p_target,
    case when p_status = 'SUSPENDED'::public.account_status
         then 'SUSPEND'::public.admin_grant_action
         else 'RESTORE'::public.admin_grant_action end,
    p_reason
  );

  perform public.log_access('ACCOUNT_STATUS', 'profiles', p_target, p_target, p_reason);
end;
$$;

-- ---------- 자격 심사 ----------
create or replace function public.admin_verify_qualification(
  p_id     uuid,
  p_status public.qualification_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.partner_qualifications
     set status = p_status
   where id = p_id
  returning partner_id into v_partner;
  if v_partner is null then
    raise exception 'qualification_not_found' using errcode = 'P0002';
  end if;

  perform public.log_access(
    'QUALIFICATION_REVIEW', 'partner_qualifications', p_id, v_partner, p_reason
  );
end;
$$;

-- ---------- 정산 상태 변경 ----------
--  일괄 승인·이체 배치는 #56 에서 설계한다. 여기서는 1건 전이만 연다.
create or replace function public.admin_update_settlement_status(
  p_id     uuid,
  p_status public.settlement_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.settlements
     set status     = p_status,
         settled_at = case when p_status = 'PAID'::public.settlement_status
                           then now() else null end
   where id = p_id
  returning partner_id into v_partner;
  if v_partner is null then
    raise exception 'settlement_not_found' using errcode = 'P0002';
  end if;

  perform public.log_access('SETTLEMENT_STATUS', 'settlements', p_id, v_partner, p_reason);
end;
$$;

revoke all on function public.admin_grant_role(uuid, text, text)              from public, anon;
revoke all on function public.admin_revoke_role(uuid, text)                   from public, anon;
revoke all on function public.admin_set_account_status(uuid, public.account_status, text)
  from public, anon;
revoke all on function public.admin_verify_qualification(uuid, public.qualification_status, text)
  from public, anon;
revoke all on function public.admin_update_settlement_status(uuid, public.settlement_status, text)
  from public, anon;

grant execute on function public.admin_grant_role(uuid, text, text)           to authenticated;
grant execute on function public.admin_revoke_role(uuid, text)                to authenticated;
grant execute on function public.admin_set_account_status(uuid, public.account_status, text)
  to authenticated;
grant execute on function public.admin_verify_qualification(uuid, public.qualification_status, text)
  to authenticated;
grant execute on function public.admin_update_settlement_status(uuid, public.settlement_status, text)
  to authenticated;

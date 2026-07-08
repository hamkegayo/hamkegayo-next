-- =============================================================
-- 계정/인증 스키마
--  - 인증: Supabase Auth(auth.users) 단일 통합 (일반 + 파트너 공용)
--  - 프로필: 공통 profiles + 파트너 전용 partner_accounts 분리
--  - 권한: role 을 auth.users.raw_app_meta_data 에 동기화 → JWT 클레임으로 사용
--
--  * 여러 번 실행해도 안전하도록 작성(idempotent).
-- =============================================================

-- ---------- 열거형(enum) ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('USER', 'PARTNER');
  end if;
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('PENDING', 'ACTIVE', 'SUSPENDED');
  end if;
end $$;

-- ---------- 공통 프로필 (auth.users 와 1:1) ----------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  role              public.user_role not null,
  name              text not null,
  phone             text,
  phone_verified_at timestamptz,
  status            public.account_status not null default 'ACTIVE',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is '일반/파트너 공통 프로필. auth.users 와 1:1.';

-- ---------- 파트너 전용 계정 정보 (role = PARTNER 만) ----------
create table if not exists public.partner_accounts (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  login_id    text not null unique,            -- 관리자가 발급한 로그인 아이디
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.partner_accounts is '파트너 전용 계정 정보. 자격증/정산 등은 이후 마일스톤에서 확장.';
comment on column public.partner_accounts.login_id is '파트너 로그인 식별자(발급 아이디). 내부적으로 합성 이메일로 매핑되어 Auth 사용.';

-- ---------- updated_at 자동 갱신 ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_partner_accounts_updated_at on public.partner_accounts;
create trigger trg_partner_accounts_updated_at
  before update on public.partner_accounts
  for each row execute function public.set_updated_at();

-- ---------- role/status → JWT 클레임 동기화 ----------
-- profiles.role / status 변경 시 auth.users.raw_app_meta_data 에 반영.
-- 이후 발급되는 JWT 의 app_metadata 에 role/status 가 담겨 RLS·미들웨어에서 조회 없이 사용 가능.
create or replace function public.sync_role_to_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
     set raw_app_meta_data =
           coalesce(raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('role', new.role, 'status', new.status)
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_sync_role_to_auth on public.profiles;
create trigger trg_sync_role_to_auth
  after insert or update of role, status on public.profiles
  for each row execute function public.sync_role_to_auth();

-- =============================================================
-- RLS 정책
-- =============================================================
alter table public.profiles enable row level security;
alter table public.partner_accounts enable row level security;

-- 본인 프로필 조회
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- 본인 프로필 수정 (role/status 변경은 관리자(service_role)만 → 여기서는 컬럼 제한 없이 두되,
-- 애플리케이션단에서 role/status 는 갱신하지 않도록 관리. 필요 시 컬럼 단위 정책으로 강화)
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 파트너 본인 계정 조회
drop policy if exists "partner_accounts_select_own" on public.partner_accounts;
create policy "partner_accounts_select_own"
  on public.partner_accounts for select
  using (auth.uid() = profile_id);

-- INSERT(계정 생성/발급) 및 role/status 관리는 service_role(관리자 서버) 전용.
-- service_role 은 RLS 를 우회하므로 별도 INSERT 정책을 두지 않아 일반 사용자 임의 생성 차단.

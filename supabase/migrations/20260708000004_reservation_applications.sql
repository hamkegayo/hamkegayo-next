-- =============================================================
-- 예약 지원(reservation_applications) 스키마 + 매칭 RLS 보강
--  - 파트너가 MATCHING 예약에 수락/거절을 기록하는 테이블
--  - 최종 선택(#21) 시 나머지 지원건은 NOT_SELECTED 로 전이
--  - reservations 에 파트너 SELECT 정책 추가
--    (MATCHING 전체 + 본인 ACCEPTED 지원 예약)
--
--  * RLS 상호참조(예약 ↔ 지원) 재귀를 피하려고 교차 검증은
--    security definer 헬퍼로 처리(해당 함수 내부는 RLS 우회).
--  * 여러 번 실행해도 안전하도록 작성(idempotent).
-- =============================================================

-- ---------- 열거형(enum) : 지원 상태 ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'application_status') then
    create type public.application_status as enum (
      'PENDING', 'ACCEPTED', 'REJECTED', 'NOT_SELECTED'
    );
  end if;
end $$;

-- ---------- 지원 테이블 ----------
create table if not exists public.reservation_applications (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  partner_id     uuid not null references public.profiles (id) on delete cascade,
  status         public.application_status not null default 'PENDING',
  -- 거절 시 사유/추가 의견 (거절 모달에서 수집)
  reject_reason  text,
  reject_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- 한 예약에 한 파트너는 1건만 (중복 수락 방지)
  unique (reservation_id, partner_id)
);

comment on table public.reservation_applications is
  '파트너의 예약 수락/거절 기록. 최종 선택 시 나머지는 NOT_SELECTED.';

-- updated_at 자동 갱신 (공통 함수 재사용)
drop trigger if exists trg_res_apps_updated_at on public.reservation_applications;
create trigger trg_res_apps_updated_at
  before update on public.reservation_applications
  for each row execute function public.set_updated_at();

create index if not exists idx_res_apps_reservation
  on public.reservation_applications (reservation_id);
create index if not exists idx_res_apps_partner
  on public.reservation_applications (partner_id, created_at desc);

-- =============================================================
-- 교차 검증용 security definer 헬퍼 (RLS 재귀 방지)
-- =============================================================

-- 현재 사용자가 해당 예약에 ACCEPTED 지원건을 가졌는가
create or replace function public.partner_has_accepted(res_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.reservation_applications a
     where a.reservation_id = res_id
       and a.partner_id = auth.uid()
       and a.status = 'ACCEPTED'::public.application_status
  );
$$;

-- 현재 사용자가 해당 예약의 소유자(고객)인가
create or replace function public.owns_reservation(res_id uuid)
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
       and r.customer_id = auth.uid()
  );
$$;

-- =============================================================
-- RLS : reservation_applications
-- =============================================================
alter table public.reservation_applications enable row level security;

-- 파트너: 본인 지원 조회
drop policy if exists "res_apps_select_own_partner" on public.reservation_applications;
create policy "res_apps_select_own_partner"
  on public.reservation_applications for select
  using (auth.uid() = partner_id);

-- 고객: 본인 예약에 달린 지원건 조회 (최종 선택 UI)
drop policy if exists "res_apps_select_owner" on public.reservation_applications;
create policy "res_apps_select_owner"
  on public.reservation_applications for select
  using (public.owns_reservation(reservation_id));

-- 파트너: 본인 지원 생성 (role = PARTNER)
drop policy if exists "res_apps_insert_partner" on public.reservation_applications;
create policy "res_apps_insert_partner"
  on public.reservation_applications for insert
  with check (
    auth.uid() = partner_id
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'PARTNER'
  );

-- 파트너: 본인 지원 수정 (수락 ↔ 거절 / 사유 갱신)
drop policy if exists "res_apps_update_partner" on public.reservation_applications;
create policy "res_apps_update_partner"
  on public.reservation_applications for update
  using (auth.uid() = partner_id)
  with check (auth.uid() = partner_id);

-- (최종 선택으로 인한 NOT_SELECTED 전이는 서버(service_role) 트랜잭션에서 처리 → #21)

-- =============================================================
-- RLS : reservations 파트너 SELECT 정책 추가
--   MATCHING 전체 + 본인 ACCEPTED 지원 예약(확정 이후 포함)
--   * 기존 reservations_select_own(고객) 정책과 OR 로 병합됨
-- =============================================================
drop policy if exists "reservations_select_partner" on public.reservations;
create policy "reservations_select_partner"
  on public.reservations for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'PARTNER'
    and (
      status = 'MATCHING'
      or public.partner_has_accepted(id)
    )
  );

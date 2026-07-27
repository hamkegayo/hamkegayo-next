-- =============================================================
-- 서비스(진행) 세션 backbone — #22
--  - 확정 예약 1건 ↔ 서비스 1건 (reservation_id unique)
--  - 예약이 CONFIRMED 되는 순간 트리거로 services 행 자동 생성(SCHEDULED)
--  - 파트너가 시작/종료/완료를 전이(state machine) — RPC 로 검증
--  - 완료 시 reservations.status 도 COMPLETED 로 전이(#21 태스크4)
--  - 리포트/정산(후속 슬라이스)은 services.id 를 FK 로 참조
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- 열거형: 서비스 진행 상태 ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_status') then
    create type public.service_status as enum (
      'SCHEDULED', 'IN_PROGRESS', 'ENDED', 'COMPLETED'
    );
  end if;
end $$;

-- ---------- services 테이블 ----------
create table if not exists public.services (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations (id) on delete cascade,
  partner_id     uuid not null references public.profiles (id) on delete cascade,
  status         public.service_status not null default 'SCHEDULED',
  started_at     timestamptz,
  ended_at       timestamptz,
  start_memo     text,
  end_memo       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.services is
  '서비스(진행) 세션. 확정 예약 1건당 1행. 파트너가 시작/종료/완료를 전이.';

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create index if not exists idx_services_partner
  on public.services (partner_id, created_at desc);
create index if not exists idx_services_status
  on public.services (status);

-- =============================================================
-- 예약 CONFIRMED → services 행 자동 생성 트리거
--   (확정 RPC 를 건드리지 않고 decouple)
-- =============================================================
create or replace function public.create_service_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'CONFIRMED'::public.reservation_status
     and old.status is distinct from new.status
     and new.confirmed_partner_id is not null then
    insert into public.services (reservation_id, partner_id)
    values (new.id, new.confirmed_partner_id)
    on conflict (reservation_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_service_on_confirm on public.reservations;
create trigger trg_create_service_on_confirm
  after update on public.reservations
  for each row execute function public.create_service_on_confirm();

-- =============================================================
-- RLS — 파트너 본인 서비스 + 예약 소유 고객
-- =============================================================
alter table public.services enable row level security;

-- 파트너: 본인 서비스 조회
drop policy if exists "services_select_partner" on public.services;
create policy "services_select_partner"
  on public.services for select
  using (auth.uid() = partner_id);

-- 고객: 본인 예약의 서비스 조회 (마이페이지 진행 단계)
drop policy if exists "services_select_owner" on public.services;
create policy "services_select_owner"
  on public.services for select
  using (public.owns_reservation(reservation_id));

-- (상태 전이는 아래 RPC(service_role/definer)에서만 → 직접 UPDATE 정책 없음)

-- =============================================================
-- 상태 전이 RPC (파트너 전용, security definer)
-- =============================================================

-- 시작: SCHEDULED → IN_PROGRESS
create or replace function public.start_service(
  p_service_id uuid,
  p_memo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_status  public.service_status;
begin
  select partner_id, status into v_partner, v_status
    from public.services where id = p_service_id for update;

  if not found then raise exception 'service_not_found'; end if;
  if v_partner is distinct from auth.uid() then raise exception 'not_partner'; end if;
  if v_status <> 'SCHEDULED'::public.service_status then raise exception 'invalid_state'; end if;

  update public.services
     set status = 'IN_PROGRESS'::public.service_status,
         started_at = now(),
         start_memo = p_memo
   where id = p_service_id;
end;
$$;

-- 종료: IN_PROGRESS → ENDED
create or replace function public.end_service(
  p_service_id uuid,
  p_memo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_status  public.service_status;
begin
  select partner_id, status into v_partner, v_status
    from public.services where id = p_service_id for update;

  if not found then raise exception 'service_not_found'; end if;
  if v_partner is distinct from auth.uid() then raise exception 'not_partner'; end if;
  if v_status <> 'IN_PROGRESS'::public.service_status then raise exception 'invalid_state'; end if;

  update public.services
     set status = 'ENDED'::public.service_status,
         ended_at = now(),
         end_memo = p_memo
   where id = p_service_id;
end;
$$;

-- 완료: ENDED → COMPLETED (+ 예약도 COMPLETED)
create or replace function public.complete_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_status  public.service_status;
  v_reservation uuid;
begin
  select partner_id, status, reservation_id
    into v_partner, v_status, v_reservation
    from public.services where id = p_service_id for update;

  if not found then raise exception 'service_not_found'; end if;
  if v_partner is distinct from auth.uid() then raise exception 'not_partner'; end if;
  if v_status <> 'ENDED'::public.service_status then raise exception 'invalid_state'; end if;

  update public.services
     set status = 'COMPLETED'::public.service_status
   where id = p_service_id;

  update public.reservations
     set status = 'COMPLETED'::public.reservation_status
   where id = v_reservation;
end;
$$;

revoke all on function public.start_service(uuid, text)   from public, anon;
revoke all on function public.end_service(uuid, text)     from public, anon;
revoke all on function public.complete_service(uuid)      from public, anon;
grant execute on function public.start_service(uuid, text)   to authenticated;
grant execute on function public.end_service(uuid, text)     to authenticated;
grant execute on function public.complete_service(uuid)      to authenticated;

-- =============================================================
-- 정산(settlements) — #22
--  - 완료(COMPLETED)된 서비스 1건당 정산 1건 자동 생성(트리거)
--  - 금액 = plan 가격(베이직 20,000 / 플러스 25,000)
--    수수료(원천징수 3.3%) = round(amount * 0.033), 실수령 = amount - fee
--  - status: PENDING(지급 예정) → PAID(지급 완료). 지급 처리는 후속(관리자).
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'settlement_status') then
    create type public.settlement_status as enum ('PENDING', 'PAID');
  end if;
end $$;

create table if not exists public.settlements (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null unique references public.services (id) on delete cascade,
  partner_id  uuid not null references public.profiles (id) on delete cascade,
  amount      integer not null,   -- 정산 금액(원)
  fee         integer not null,   -- 원천징수/수수료(원)
  net         integer not null,   -- 실수령액(원)
  status      public.settlement_status not null default 'PENDING',
  settled_at  timestamptz,        -- 지급 완료 시각(PAID)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.settlements is '파트너 정산. 완료된 서비스 1건당 1행. 금액은 plan 기준.';

drop trigger if exists trg_settlements_updated_at on public.settlements;
create trigger trg_settlements_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();

create index if not exists idx_settlements_partner
  on public.settlements (partner_id, created_at desc);

-- =============================================================
-- 서비스 COMPLETED → 정산 자동 생성 트리거
-- =============================================================
create or replace function public.create_settlement_on_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan   text;
  v_amount integer;
  v_fee    integer;
begin
  if new.status = 'COMPLETED'::public.service_status
     and old.status is distinct from new.status then

    select plan into v_plan
      from public.reservations
     where id = new.reservation_id;

    v_amount := case when v_plan = 'plus' then 25000 else 20000 end;
    v_fee := round(v_amount * 0.033);

    insert into public.settlements (service_id, partner_id, amount, fee, net)
    values (new.id, new.partner_id, v_amount, v_fee, v_amount - v_fee)
    on conflict (service_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_settlement_on_complete on public.services;
create trigger trg_create_settlement_on_complete
  after update on public.services
  for each row execute function public.create_settlement_on_complete();

-- =============================================================
-- RLS — 파트너 본인 정산 조회
-- =============================================================
alter table public.settlements enable row level security;

drop policy if exists "settlements_select_partner" on public.settlements;
create policy "settlements_select_partner"
  on public.settlements for select
  using (auth.uid() = partner_id);

-- =============================================================
-- 예약(reservation) 스키마
--  - 로그인 사용자(customer_id = profiles.id)가 생성하는 병원 동행 예약
--  - 생성 시 status = MATCHING (파트너 매칭 대기)
--  - 환자(이용자) 정보는 별도 회원이 아닐 수 있어 예약에 인라인 저장
--
--  * 여러 번 실행해도 안전하도록 작성(idempotent).
-- =============================================================

-- ---------- 열거형(enum) ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reservation_status') then
    create type public.reservation_status as enum (
      'MATCHING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'
    );
  end if;
end $$;

-- ---------- 예약 테이블 ----------
create table if not exists public.reservations (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,                 -- 예약번호 (R20260628-8594 형식)
  customer_id       uuid not null references public.profiles (id) on delete cascade,
  status            public.reservation_status not null default 'MATCHING',
  plan              text not null check (plan in ('basic', 'plus')),

  -- 이용자(환자) 정보
  patient_name      text not null,
  patient_birth     date not null,
  patient_gender    text not null check (patient_gender in ('female', 'male')),
  patient_phone     text not null,

  -- 예약자(보호자) 정보
  guardian_name     text not null,
  guardian_phone    text not null,
  relation          text not null,

  -- 진료 정보
  treatment         text not null,
  purpose           text not null,
  cautions          text,
  doc_prescription  boolean not null default false,
  doc_receipt       boolean not null default false,
  doc_certificate   boolean not null default false,
  other_requests    text,

  -- 일정 / 장소
  use_date          date not null,
  arrive_time       text not null,
  reserve_time      text not null,
  duration          text not null,
  depart_address    text not null,
  hospital_address  text not null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.reservations is '병원 동행 예약. 생성 시 MATCHING 상태.';
comment on column public.reservations.code is '사용자 노출용 예약번호(고유).';

-- ---------- updated_at 자동 갱신 (공통 함수 재사용) ----------
drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

create index if not exists idx_reservations_customer
  on public.reservations (customer_id, created_at desc);

-- =============================================================
-- RLS 정책 — 본인(customer_id) 예약만 접근
-- =============================================================
alter table public.reservations enable row level security;

drop policy if exists "reservations_select_own" on public.reservations;
create policy "reservations_select_own"
  on public.reservations for select
  using (auth.uid() = customer_id);

drop policy if exists "reservations_insert_own" on public.reservations;
create policy "reservations_insert_own"
  on public.reservations for insert
  with check (auth.uid() = customer_id);

drop policy if exists "reservations_update_own" on public.reservations;
create policy "reservations_update_own"
  on public.reservations for update
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

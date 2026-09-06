-- =============================================================
-- 결제(payments) 신설 · 매칭 확정 트랜잭션 분리 · 정산 정비 — #49
--
--  약관 제9조 ④ : 회원이 파트너 1명을 최종 선택하고 선결제를 완료한 시점에 예약이 확정된다.
--    → 선택(MATCHING 유지)과 확정(CONFIRMED)을 분리하고, 그 사이에 결제를 둔다.
--  약관 제19조 ② : 취소수수료는 선결제금액에서 차감하고 나머지를 환불한다.
--    → 취소수수료는 별도 청구가 아니라 REFUND 행의 차감액으로 표현한다.
--  약관 제21조 ③④⑤ : 종료 후 최종 산정 → 미달분 환불 / 초과분 추가결제.
--
--  payments 가 금액의 정본이고 settlements 는 여기서 파생된다.
--  결제 승인·취소 자체는 PG(NICEPAY) 연동에서 처리한다. 이 마이그레이션은 스키마와
--  상태 전이까지만 담당하며 컬럼명은 PG 중립으로 둔다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- 열거형 ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_type') then
    -- BASE      : 선결제 (제21조 ①)
    -- EXTENSION : 추가결제 (제21조 ⑤)
    -- REFUND    : 부분취소·환불 (제21조 ④, 제19조 ②) — 금액을 음수로 기록
    create type public.payment_type as enum ('BASE', 'EXTENSION', 'REFUND');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'PENDING', 'PAID', 'FAILED', 'CANCELLED'
    );
  end if;
end $$;

-- ---------- payments ----------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  reservation_id    uuid not null references public.reservations (id) on delete cascade,
  type              public.payment_type   not null,
  status            public.payment_status not null default 'PENDING',

  -- PG 식별자 (중립 명칭 유지)
  order_id          text not null unique,          -- 가맹점 주문번호
  transaction_id    text unique,                   -- PG 거래번호 (승인 후 채워짐)

  -- 금액 3분할 — 환불(REFUND)은 전부 음수로 기록해 합계가 실수취액이 되도록 한다
  gross_amount      integer not null,              -- 고객 결제액
  discount_amount   integer not null default 0,    -- 포인트 등 할인 (제19조 ⑥)
  commission_amount integer not null default 0,    -- 플랫폼 수수료
  payout_amount     integer not null,              -- 파트너 지급 대상액
  commission_rate   numeric(4,3),                  -- 결제 시점 수수료율 스냅샷

  -- 취소수수료는 별도 결제가 아니라 "환불하지 않은 금액"이다 (제19조 ②)
  cancel_fee_amount integer not null default 0,

  -- PG 수수료는 플랫폼이 부담한다 → payout 계산식에 넣지 않고 참고용으로만 둔다
  pg_fee            integer,

  -- 결제 링크 (제21조 ⑤ · 제22조 ①)
  pay_token         text unique,
  token_expires_at  timestamptz,

  raw_response      jsonb,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint payments_amount_split
    check (gross_amount - discount_amount - commission_amount = payout_amount)
);

comment on table public.payments is
  '결제 원장. 금액의 정본이며 settlements 는 여기서 파생된다. 환불은 음수 행으로 쌓는다.';
comment on column public.payments.cancel_fee_amount is
  '취소수수료(원). 약관 제19조 ② — 선결제금액에서 차감 후 잔액을 환불하므로 REFUND 행에 기록한다.';
comment on column public.payments.pg_fee is
  'PG 수수료(원). 플랫폼 부담이라 payout 계산에 관여하지 않는 참고 값.';

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create index if not exists idx_payments_reservation
  on public.payments (reservation_id, created_at desc);
create index if not exists idx_payments_status
  on public.payments (status);

-- ---------- RLS : 본인 SELECT 만. 쓰기는 service_role 전용 ----------
alter table public.payments enable row level security;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
  on public.payments for select
  using (public.owns_reservation(reservation_id));

-- INSERT/UPDATE/DELETE 정책 없음 → authenticated 는 쓰기 불가(service_role 만 가능)

-- =============================================================
-- 매칭 확정 트랜잭션 분리 (약관 제9조 ④)
-- =============================================================

alter table public.reservations
  add column if not exists payment_deadline timestamptz;

comment on column public.reservations.payment_deadline is
  '파트너 선택 후 선결제 기한. 선택 시점 +30분. 만료 시 선택만 해제된다(지원건은 유지).';

-- ---------- 예약 구간 계산 (소프트 홀드용) ----------
--  arrive_time 은 "9시 30분" / "09:30" 등으로 저장되므로 숫자 두 개를 뽑아 구성한다
--  (expire_past_matchings 와 동일한 해석). 예약 일시는 KST 기준.
create or replace function public.reservation_start_at(
  p_use_date date,
  p_time text
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (
    p_use_date
    + make_time(
        (regexp_match(p_time, '(\d{1,2})'))[1]::int,
        coalesce((regexp_match(p_time, '\d{1,2}\D+(\d{1,2})'))[1]::int, 0),
        0
      )
  ) at time zone 'Asia/Seoul';
$$;

comment on function public.reservation_start_at(date, text) is
  '예약 시작 예정시각(KST). use_date + arrive_time 을 timestamptz 로 변환.';

-- =============================================================
-- ① 파트너 선택 — 상태는 MATCHING 유지, 결제 기한만 건다
--    소프트 홀드 : 같은 파트너가 겹치는 시간대에 이미 잡혀 있으면 거절
-- =============================================================
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
  v_start    timestamptz;
  v_end      timestamptz;
  v_deadline timestamptz;
begin
  select customer_id, status,
         public.reservation_start_at(use_date, arrive_time),
         public.reservation_start_at(use_date, arrive_time)
           + make_interval(mins => coalesce(duration_minutes, 120))
    into v_customer, v_status, v_start, v_end
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found then raise exception 'reservation_not_found'; end if;
  if v_customer is distinct from auth.uid() then raise exception 'not_owner'; end if;
  if v_status <> 'MATCHING'::public.reservation_status then raise exception 'not_matching'; end if;

  -- 선택 파트너가 이 예약에 ACCEPTED 지원건을 가졌는지 확인
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

  -- 여기서는 알림을 보내지 않는다. 파트너 확정 알림은 결제 성공 시점으로 옮겼다.
  return v_deadline;
end;
$$;

revoke all on function public.select_reservation_partner(uuid, uuid) from public, anon;
grant execute on function public.select_reservation_partner(uuid, uuid) to authenticated;

-- =============================================================
-- ② 결제 성공 → 예약 확정 (제9조 ④)
--    나머지 ACCEPTED → NOT_SELECTED 전이도 여기서 한다.
--    선택 시점에 미루지 않으므로 30분 만료 시 롤백이 필요 없다.
--    결제 검증은 서버(service_role)가 끝낸 뒤 호출한다.
-- =============================================================
create or replace function public.confirm_reservation_payment(
  p_reservation_id uuid,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner  uuid;
  v_status   public.reservation_status;
  v_deadline timestamptz;
  v_paid     boolean;
begin
  select confirmed_partner_id, status, payment_deadline
    into v_partner, v_status, v_deadline
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found then raise exception 'reservation_not_found'; end if;
  if v_partner is null then raise exception 'partner_not_selected'; end if;
  if v_status <> 'MATCHING'::public.reservation_status then raise exception 'not_matching'; end if;
  if v_deadline is not null and v_deadline <= now() then raise exception 'payment_expired'; end if;

  select status = 'PAID'::public.payment_status
    into v_paid
    from public.payments
   where id = p_payment_id
     and reservation_id = p_reservation_id
     and type = 'BASE'::public.payment_type;

  if v_paid is not true then raise exception 'payment_not_paid'; end if;

  update public.reservations
     set status = 'CONFIRMED'::public.reservation_status,
         payment_deadline = null
   where id = p_reservation_id;

  update public.reservation_applications
     set status = 'NOT_SELECTED'::public.application_status
   where reservation_id = p_reservation_id
     and partner_id <> v_partner
     and status = 'ACCEPTED'::public.application_status;
end;
$$;

revoke all on function public.confirm_reservation_payment(uuid, uuid) from public, anon, authenticated;

-- =============================================================
-- ③ 결제 기한 만료 정리 (lazy 호출)
--    선택만 풀고 지원건은 그대로 두므로 즉시 재선택이 가능하다.
-- =============================================================
create or replace function public.release_expired_selections()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.reservations
     set confirmed_partner_id = null,
         payment_deadline = null
   where status = 'MATCHING'::public.reservation_status
     and payment_deadline is not null
     and payment_deadline <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.release_expired_selections() is
  '결제 기한(30분)이 지난 파트너 선택을 해제한다. 지원건(ACCEPTED)은 유지되어 재선택 가능.';

-- 기존 단일 확정 RPC(선택 즉시 CONFIRMED)는 제9조 ④ 순서와 맞지 않는다.
-- 다만 결제 화면 이동(FE)과 PG 연동이 끝나기 전에 지우면 파트너 선택이 동작하지 않으므로
-- 그때까지 남겨 둔다. 새 경로로 전환한 뒤 제거할 것.
comment on function public.confirm_reservation_partner(uuid, uuid) is
  'DEPRECATED — 선택 즉시 CONFIRMED 로 전이(약관 제9조 ④ 위반). '
  'select_reservation_partner + confirm_reservation_payment 로 대체 예정. FE·PG 전환 후 제거.';

-- =============================================================
-- 정산 정비
--   - service 1건에 정산 여러 행(1차 정산 + 이후 차감 정산)을 허용한다.
--   - 금액은 payments 에서 파생된다. 차감 정산은 음수로 쌓는다.
-- =============================================================

alter table public.settlements
  drop constraint if exists settlements_service_id_key;

alter table public.settlements
  add column if not exists payment_id  uuid references public.payments (id),
  add column if not exists reason      text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists paid_at      timestamptz;

comment on column public.settlements.payment_id is
  '파생 근거가 된 결제 행. 차감 정산은 REFUND 결제를 가리킨다.';
comment on column public.settlements.reason is
  '정산 사유 (SERVICE_COMPLETED / REFUND / ADJUSTMENT 등).';

-- 같은 결제로 두 번 정산되지 않도록 (payment_id 가 있는 행만)
create unique index if not exists uq_settlements_payment
  on public.settlements (payment_id) where payment_id is not null;

-- 1차 정산은 서비스 1건당 하나만 (차감 정산은 payment_id 가 있으므로 제외)
create unique index if not exists uq_settlements_service_primary
  on public.settlements (service_id) where payment_id is null;

create index if not exists idx_settlements_service
  on public.settlements (service_id);

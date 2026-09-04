-- =============================================================
-- 결제 사고 원장(payment_incidents) — #79
--
--  지금 승인 라우트의 실패 지점은 전부 console.error 뿐이다.
--  Vercel 로그 한 줄이라 실시간으로 보는 사람이 없고, 가장 나쁜 경우는 이것이다.
--
--    cancelApproved() 실패 → 승인은 됐는데 취소도 실패했고, 예약도 없다
--
--  **돈은 받았는데 예약이 없는 상태**가 어디에도 남지 않는다.
--  Phase 3 에서 실결제가 시작되면 그때부터 이건 실제 돈이다.
--
--  설계 원칙
--   1. 사고 적재가 결제 흐름을 막지 않는다. 기록 때문에 결제가 깨지면 본말전도다.
--   2. order_id 에 FK 를 걸지 않는다 — 우리가 만들지 않은 주문의 승인 시도도 기록해야 한다.
--   3. detail 에 개인정보를 넣지 않는다. 예약번호로 관리자 RPC 를 통해 조회하면
--      access_logs 에 남는다(#50).
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_incident_kind') then
    create type public.payment_incident_kind as enum (
      'CANCEL_FAILED',          -- 승인 취소 실패 — 돈 받고 예약 없음
      'APPROVE_INDETERMINATE',  -- 타임아웃 — 승인 여부 불명
      'POINT_RESTORE_FAILED',   -- 포인트 미복원
      'STATE_MISMATCH',         -- PG 는 PAID 인데 DB 는 아님
      'AMOUNT_MISMATCH',        -- 유효 서명 + 금액 위조 — 공격 신호
      'UNKNOWN_ORDER',          -- 우리가 만들지 않은 주문 승인 시도
      'FINALIZE_FAILED'         -- 확정 실패(취소는 성공)
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_incident_severity') then
    -- CRITICAL 은 돈이 어긋난 상태다. 담당자가 즉시 봐야 한다.
    create type public.payment_incident_severity as enum ('CRITICAL', 'HIGH', 'MEDIUM');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_incident_status') then
    create type public.payment_incident_status as enum (
      'OPEN', 'ACKNOWLEDGED', 'RESOLVED'
    );
  end if;
end $$;

create table if not exists public.payment_incidents (
  id           uuid primary key default gen_random_uuid(),

  -- 우리 결제가 아닐 수도 있으므로 payment_id 는 nullable, order_id 는 FK 없음
  payment_id     uuid references public.payments (id) on delete set null,
  reservation_id uuid references public.reservations (id) on delete set null,
  order_id       text,

  kind         public.payment_incident_kind     not null,
  severity     public.payment_incident_severity not null,
  status       public.payment_incident_status   not null default 'OPEN',

  -- 금액은 조치 판단에 필요하다. 개인정보가 아니다.
  amount       integer,
  -- PG 응답 코드·메시지 등. ⚠️ 환자 정보·연락처를 넣지 않는다.
  detail       jsonb,

  -- 처리 이력
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  memo         text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.payment_incidents is
  '결제 사고 원장. 승인·취소·복원 실패를 기록한다. 조회는 관리자 RPC 로만(#80).';
comment on column public.payment_incidents.order_id is
  '가맹점 주문번호. 우리가 만들지 않은 주문도 기록하므로 FK 를 걸지 않는다.';
comment on column public.payment_incidents.detail is
  'PG 응답 코드·메시지 등 조치에 필요한 값. ⚠️ 개인정보를 넣지 않는다.';

drop trigger if exists trg_payment_incidents_updated_at on public.payment_incidents;
create trigger trg_payment_incidents_updated_at
  before update on public.payment_incidents
  for each row execute function public.set_updated_at();

create index if not exists idx_payment_incidents_open
  on public.payment_incidents (severity, created_at desc)
  where status <> 'RESOLVED'::public.payment_incident_status;
create index if not exists idx_payment_incidents_order
  on public.payment_incidents (order_id) where order_id is not null;
create index if not exists idx_payment_incidents_created
  on public.payment_incidents (created_at desc);

-- ---------- RLS : 아무에게도 열지 않는다 ----------
--  일반 사용자·파트너는 물론 관리자에게도 직접 조회 정책을 주지 않는다.
--  #50 원칙 — 관리자 조회는 RPC + access_logs 로만 연다(#80 에서 붙인다).
--  정책이 하나도 없으므로 service_role 만 읽고 쓸 수 있다.
alter table public.payment_incidents enable row level security;

-- =============================================================
-- 적재 — 서버 전용
--
--   ⚠️ 이 함수는 실패해도 결제 흐름을 막으면 안 된다.
--      호출부(lib/payments/incident.ts)가 예외를 삼킨다.
-- =============================================================
create or replace function public.report_payment_incident(
  p_kind        text,
  p_severity    text,
  p_order_id    text    default null,
  p_payment_id  uuid    default null,
  p_amount      integer default null,
  p_detail      jsonb   default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation uuid;
  v_id          uuid;
begin
  -- 결제를 알면 예약도 함께 묶어 둔다. 관리자 화면에서 건을 지목하는 데 쓴다.
  if p_payment_id is not null then
    select reservation_id into v_reservation
      from public.payments where id = p_payment_id;
  end if;

  insert into public.payment_incidents (
    payment_id, reservation_id, order_id, kind, severity, amount, detail
  ) values (
    p_payment_id,
    v_reservation,
    p_order_id,
    p_kind::public.payment_incident_kind,
    p_severity::public.payment_incident_severity,
    p_amount,
    p_detail
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.report_payment_incident(text, text, text, uuid, integer, jsonb) is
  '결제 사고를 적재한다. 서버 전용. 실패해도 결제 흐름을 막지 않도록 호출부가 예외를 삼킨다.';

revoke all on function public.report_payment_incident(text, text, text, uuid, integer, jsonb)
  from public, anon, authenticated;

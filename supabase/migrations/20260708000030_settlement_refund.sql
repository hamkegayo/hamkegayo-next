-- =============================================================
-- 종료 후 미달분 환불 — 관리자 승인 큐 (#76) · 약관 제21조 ④
--
--  왜 자동으로 내보내지 않나 (2026-09-05 기획 확정)
--    미달분은 파트너가 누른 종료 시각으로 계산된다. 시각을 잘못 눌렀거나
--    현장에서 다툼이 있으면 금액이 틀린 채로 돈이 나간다. 나간 돈은
--    되돌리기 어렵다. **사람이 한 번 보고 내보낸다.**
--
--  취소 환불(refund_payment)과 다른 점
--    · 예약을 취소하지 않는다 — 서비스는 정상 완료된 건이다
--    · 이미 만들어진 정산에 **차감 정산**을 얹는다
--    · 포인트는 건드리지 않는다 — 사용분은 그대로 소진된 것이다
--
--  상태 흐름
--    PENDING ──승인──> APPROVED ──PG 취소 성공──> COMPLETED
--       └────거절────> REJECTED
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'refund_request_status') then
    create type public.refund_request_status as enum
      ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');
  end if;
end;
$$;

create table if not exists public.refund_requests (
  id                uuid primary key default gen_random_uuid(),
  reservation_id    uuid not null references public.reservations (id) on delete cascade,
  payment_id        uuid not null references public.payments (id),
  /** 환불 예정 금액(원, 양수) */
  amount            integer not null check (amount > 0),
  status            public.refund_request_status not null default 'PENDING',
  reason            text,
  requested_at      timestamptz not null default now(),
  decided_by        uuid references public.profiles (id),
  decided_at        timestamptz,
  decided_memo      text,
  completed_at      timestamptz,
  /** 집행 결과로 생성된 REFUND 결제 행 */
  refund_payment_id uuid references public.payments (id),

  -- 미달분 환불은 예약당 한 건이다. 재요청은 기존 건을 다시 쓴다.
  --
  -- 부분 재환불이나 특수 CS 로 한 예약에 여러 건이 필요해지면 이 제약을
  -- 풀고 차감 정산을 건별로 쌓도록 보완한다. 요구사항이 구체화되기 전에
  -- 미리 열어 두면 "환불이 두 번 나갔다" 를 막을 장치가 사라진다.
  -- (2026-09-05 리뷰 확정)
  constraint refund_requests_reservation_unique unique (reservation_id)
);

comment on table public.refund_requests is
  '종료 후 미달분 환불 승인 큐(약관 제21조 ④). 관리자가 승인해야 실제 환불이 나간다. 조회는 본인·관리자, 쓰기는 서버.';

create index if not exists idx_refund_requests_status
  on public.refund_requests (status, requested_at);

-- ---------- RLS ----------
-- 고객은 자기 건을, 관리자는 전부 본다. 쓰기 정책은 두지 않는다 —
-- 승인 여부를 당사자가 바꿀 수 있으면 승인 절차가 의미를 잃는다.
alter table public.refund_requests enable row level security;

drop policy if exists "refund_requests_select_own" on public.refund_requests;
create policy "refund_requests_select_own"
  on public.refund_requests for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.reservations r
       where r.id = refund_requests.reservation_id
         and r.customer_id = auth.uid()
    )
  );

-- =============================================================
-- ① 적재 — 서비스 종료 시 서버가 부른다
-- =============================================================
create or replace function public.request_settlement_refund(
  p_reservation_id uuid,
  p_amount         integer,
  p_reason         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment uuid;
  v_id      uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  select id into v_payment
    from public.payments
   where reservation_id = p_reservation_id
     and type = 'BASE'::public.payment_type
     and status = 'PAID'::public.payment_status
   limit 1;

  if v_payment is null then
    return null;  -- 선결제가 없으면 돌려줄 것도 없다
  end if;

  -- 종료를 두 번 눌렀거나 금액이 다시 산정된 경우. 아직 결정 전이면 금액을 갱신한다.
  insert into public.refund_requests (reservation_id, payment_id, amount, reason)
  values (p_reservation_id, v_payment, p_amount, p_reason)
  on conflict (reservation_id) do update
     set amount = case when public.refund_requests.status = 'PENDING'::public.refund_request_status
                       then excluded.amount else public.refund_requests.amount end,
         reason = coalesce(excluded.reason, public.refund_requests.reason)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.request_settlement_refund(uuid, integer, text) is
  '미달분 환불을 승인 큐에 넣는다. 예약당 1건이며 PENDING 인 동안에는 금액을 갱신한다. 서버 전용.';

revoke all on function public.request_settlement_refund(uuid, integer, text)
  from public, anon, authenticated;

-- =============================================================
-- ② 승인·거절 — 관리자 세션으로 부른다 (#50 규약)
-- =============================================================
create or replace function public.admin_decide_refund_request(
  p_id      uuid,
  p_approve boolean,
  p_memo    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res uuid;
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.refund_requests
     set status = case when p_approve then 'APPROVED'::public.refund_request_status
                       else 'REJECTED'::public.refund_request_status end,
         decided_by = auth.uid(),
         decided_at = now(),
         decided_memo = p_memo
   where id = p_id
     and status = 'PENDING'::public.refund_request_status
  returning reservation_id into v_res;

  if v_res is null then
    raise exception 'refund_request_not_actionable' using errcode = 'P0002';
  end if;

  perform public.log_access('REFUND_DECISION', 'refund_requests', p_id, null, p_memo);
end;
$$;

comment on function public.admin_decide_refund_request(uuid, boolean, text) is
  '미달분 환불을 승인·거절한다. PENDING 인 건만 바꿀 수 있고 접속기록을 남긴다(#50).';

revoke all on function public.admin_decide_refund_request(uuid, boolean, text)
  from public, anon;
grant execute on function public.admin_decide_refund_request(uuid, boolean, text)
  to authenticated;

-- =============================================================
-- ③ 집행 기록 — PG 부분취소가 성공한 뒤 서버가 부른다
--
--  취소 환불과 달리 **예약 상태를 건드리지 않는다.** 서비스는 완료됐다.
--  대신 이미 만들어진 정산에 차감 정산을 얹는다.
-- =============================================================
create or replace function public.record_settlement_refund(
  p_request_id uuid,
  p_raw        jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req        public.refund_requests%rowtype;
  v_pay        public.payments%rowtype;
  v_service    uuid;
  v_partner    uuid;
  v_rate       numeric;
  v_commission integer;
  v_payout     integer;
  v_refund_id  uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select * into v_req from public.refund_requests where id = p_request_id;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'P0002';
  end if;
  if v_req.status = 'COMPLETED'::public.refund_request_status then
    return jsonb_build_object('already', true, 'refund_payment_id', v_req.refund_payment_id);
  end if;
  if v_req.status <> 'APPROVED'::public.refund_request_status then
    raise exception 'refund_request_not_approved' using errcode = 'P0001';
  end if;

  select * into v_pay from public.payments where id = v_req.payment_id;
  v_rate := coalesce(v_pay.commission_rate, 0);

  -- 미달분은 현금만 돌려준다. 포인트 사용분은 그대로 소진된 것으로 둔다.
  v_commission := round(v_req.amount * v_rate)::integer;
  v_payout     := v_req.amount - v_commission;

  insert into public.payments (
    reservation_id, type, status, order_id,
    gross_amount, discount_amount, commission_amount, payout_amount,
    commission_rate, raw_response, paid_at
  ) values (
    v_req.reservation_id,
    'REFUND'::public.payment_type,
    'PAID'::public.payment_status,
    v_pay.order_id || '-S',
    -v_req.amount, 0, -v_commission, -v_payout,
    v_rate, p_raw, now()
  )
  returning id into v_refund_id;

  -- 차감 정산 — uq_settlements_payment 가 이중 정산을 막는다.
  select s.id, s.partner_id into v_service, v_partner
    from public.services s
   where s.reservation_id = v_req.reservation_id
   limit 1;

  if v_service is not null then
    insert into public.settlements (service_id, partner_id, amount, fee, net, payment_id, reason)
    values (v_service, v_partner, -v_req.amount, -v_commission, -v_payout, v_refund_id, 'REFUND')
    -- uq_settlements_payment 는 부분 인덱스라 같은 조건을 함께 적어야 매칭된다.
    on conflict (payment_id) where payment_id is not null do nothing;
  end if;

  update public.refund_requests
     set status = 'COMPLETED'::public.refund_request_status,
         completed_at = now(),
         refund_payment_id = v_refund_id
   where id = p_request_id;

  return jsonb_build_object(
    'already', false,
    'refund_payment_id', v_refund_id,
    'amount', v_req.amount
  );
end;
$$;

comment on function public.record_settlement_refund(uuid, jsonb) is
  '승인된 미달분 환불의 집행 결과를 기록한다. REFUND 결제 행 + 차감 정산. 예약 상태는 건드리지 않는다. 서버 전용.';

revoke all on function public.record_settlement_refund(uuid, jsonb)
  from public, anon, authenticated;

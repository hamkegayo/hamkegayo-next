-- =============================================================
-- 추가결제 링크 발급·승인 (#75) — 약관 제21조 ⑤ · 제22조
--
--  금액은 이미 계산되고 있었다. finalizeServiceCharge 가 종료 시
--  final_amount 를 저장하고 선결제액과의 차액까지 돌려준다(#46).
--  **그 차액으로 아무것도 하지 않는 것**이 이 이슈다.
--
--  차액의 부호로 갈린다.
--    양수(더 받아야 함) → 여기. 추가결제 링크를 발급한다
--    음수(돌려줘야 함)  → refund_requests 승인 큐 (#76)
--
--  노쇼도 같은 경로를 탄다. 약관 제19조가 정한 노쇼 청구(1시간 이용요금)는
--  선결제(최소 2시간)보다 작아 실제로는 환불이 나지만, 출동비용 실비가
--  더해져 선결제를 넘으면 추가결제가 된다. 부호로 가르면 둘 다 처리된다.
-- =============================================================

alter table public.payments
  -- 링크를 실제로 보낸 시각. 소프트 상한에 걸린 건은 검토 전까지 비어 있다.
  add column if not exists link_sent_at    timestamptz,
  -- 소프트 상한 초과 — 관리자가 확인하기 전에는 링크를 보내지 않는다.
  add column if not exists review_required boolean not null default false,
  -- 'EXTENSION'(연장) / 'NO_SHOW'(이용자 미도착) 등 청구 사유
  add column if not exists charge_reason   text;

comment on column public.payments.link_sent_at is
  '추가결제 링크를 발송한 시각. 소프트 상한에 걸리면 관리자 검토 전까지 null 이다.';
comment on column public.payments.review_required is
  '총액이 소프트 상한을 넘어 관리자 확인이 필요한 건(#75). 확인 전에는 링크를 보내지 않는다.';
comment on column public.payments.charge_reason is
  '추가결제 사유. EXTENSION(연장) / NO_SHOW(이용자 미도착, 약관 제19조).';

-- =============================================================
-- ① 추가결제 발급
--
--  order_id 와 pay_token 은 앱이 만들어 넘긴다. 선결제(#53)와 같은 생성기를
--  써야 형식이 갈라지지 않는다(lib/payments/order.ts).
--
--  멱등 — 같은 예약에 PENDING 인 추가결제가 이미 있으면 그것을 돌려준다.
--  파트너가 종료를 두 번 눌러도 청구가 두 벌 생기지 않는다.
-- =============================================================
create or replace function public.create_extension_payment(
  p_reservation_id  uuid,
  p_amount          integer,
  p_reason          text,
  p_order_id        text,
  p_token           text,
  p_token_expires   timestamptz,
  /** 총액(선결제 + 이번 청구)이 이 값을 넘으면 관리자 검토 대상 */
  p_review_threshold integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.payments%rowtype;
  v_base     public.payments%rowtype;
  v_rate     numeric;
  v_commission integer;
  v_payout   integer;
  v_review   boolean;
  v_id       uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return null;  -- 더 받을 것이 없다
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_reservation_id::text, 1));

  -- 이미 발급된 미결제 건이 있으면 그것을 쓴다.
  select * into v_existing
    from public.payments
   where reservation_id = p_reservation_id
     and type = 'EXTENSION'::public.payment_type
     and status = 'PENDING'::public.payment_status
   limit 1;

  if found then
    return jsonb_build_object(
      'already', true,
      'payment_id', v_existing.id,
      'token', v_existing.pay_token,
      'amount', v_existing.gross_amount,
      'review_required', v_existing.review_required
    );
  end if;

  -- 수수료율은 선결제 건에서 가져온다. 같은 예약이면 같은 율이어야 한다.
  select * into v_base
    from public.payments
   where reservation_id = p_reservation_id
     and type = 'BASE'::public.payment_type
     and status = 'PAID'::public.payment_status
   limit 1;

  v_rate := coalesce(v_base.commission_rate, 0);
  v_commission := round(p_amount * v_rate)::integer;
  v_payout := p_amount - v_commission;

  -- 소프트 상한은 **총액** 기준이다. 이번 청구액만 보면 여러 번 쪼개
  -- 넘길 수 있다.
  v_review := (coalesce(v_base.gross_amount, 0) + p_amount) > p_review_threshold;

  insert into public.payments (
    reservation_id, type, status, order_id,
    gross_amount, discount_amount, commission_amount, payout_amount,
    commission_rate, pay_token, token_expires_at,
    review_required, charge_reason
  ) values (
    p_reservation_id,
    'EXTENSION'::public.payment_type,
    'PENDING'::public.payment_status,
    p_order_id,
    p_amount, 0, v_commission, v_payout,
    v_rate, p_token, p_token_expires,
    v_review, p_reason
  )
  returning id into v_id;

  return jsonb_build_object(
    'already', false,
    'payment_id', v_id,
    'token', p_token,
    'amount', p_amount,
    'review_required', v_review
  );
end;
$$;

comment on function public.create_extension_payment(uuid, integer, text, text, text, timestamptz, integer) is
  '추가결제 PENDING 행과 결제 링크 토큰을 발급한다. 예약당 미결제 1건으로 멱등. 총액이 상한을 넘으면 review_required 로 표시한다. 서버 전용.';

revoke all on function public.create_extension_payment(uuid, integer, text, text, text, timestamptz, integer)
  from public, anon, authenticated;

-- =============================================================
-- ② 토큰으로 결제 정보 조회 — **비로그인 접근**
--
--  ⚠️ 환자 정보를 담지 않는다. 링크는 문자·메일로 흘러다니고 받는 사람이
--     예약자가 아닐 수 있다. 금액과 서비스 일시까지만 내린다.
--     (처리방침 제5조 — 필요 최소 범위)
-- =============================================================
create or replace function public.get_extension_charge(p_token text)
returns table (
  order_id     text,
  amount       integer,
  status       text,
  /** 서비스 이용일. 결제자가 어느 건인지 알아볼 최소 정보 */
  use_date     date,
  /** 예약번호 — 문의 시 건을 지목하는 식별자. 개인정보가 아니다 */
  code         text,
  expired      boolean,
  charge_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select p.order_id,
         p.gross_amount,
         p.status::text,
         r.use_date,
         r.code,
         (p.token_expires_at is not null and p.token_expires_at <= now()),
         p.charge_reason
    from public.payments p
    join public.reservations r on r.id = p.reservation_id
   where p.pay_token = p_token
     and p.type = 'EXTENSION'::public.payment_type;
end;
$$;

comment on function public.get_extension_charge(text) is
  '결제 링크 토큰으로 청구 정보를 조회한다. 비로그인 접근이므로 환자 정보를 내리지 않는다(#75).';

revoke all on function public.get_extension_charge(text) from public;
grant execute on function public.get_extension_charge(text) to anon, authenticated;

-- =============================================================
-- ③ 추가결제 승인 확정
--
--  선결제(finalize_payment)와 달리 **예약 상태를 건드리지 않는다.**
--  이미 확정·완료된 예약에 붙는 청구다.
--
--  토큰은 1회용이다. 승인과 동시에 지워 같은 링크로 다시 결제되지 않게 한다.
-- =============================================================
create or replace function public.finalize_extension_payment(
  p_payment_id     uuid,
  p_transaction_id text,
  p_raw            jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_payment_id::text, 2));

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_pay.status = 'PAID'::public.payment_status then
    return jsonb_build_object('already', true, 'payment_id', p_payment_id);
  end if;
  if v_pay.status <> 'PENDING'::public.payment_status then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.payments
     set status = 'PAID'::public.payment_status,
         transaction_id = p_transaction_id,
         raw_response = p_raw,
         paid_at = now(),
         -- 1회용 — 같은 링크로 두 번 결제되지 않게 지운다.
         pay_token = null,
         token_expires_at = null
   where id = p_payment_id;

  return jsonb_build_object('already', false, 'payment_id', p_payment_id);
end;
$$;

comment on function public.finalize_extension_payment(uuid, text, jsonb) is
  '추가결제를 PAID 로 확정한다. 예약 상태는 건드리지 않는다(이미 확정된 예약에 붙는 청구). 토큰을 소거해 1회용을 강제한다.';

revoke all on function public.finalize_extension_payment(uuid, text, jsonb)
  from public, anon, authenticated;

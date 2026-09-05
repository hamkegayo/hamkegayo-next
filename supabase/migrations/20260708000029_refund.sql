-- =============================================================
-- 결제 취소·환불 (#76) — 약관 제19조 · 제21조 ④
--
--  지금까지 무슨 일이 벌어지고 있었나
--    cancelConfirmedReservation 은 **결제를 전혀 건드리지 않는다.**
--    고객이 선결제한 예약을 취소하면 예약만 CANCELLED 가 되고 돈은 PG 에
--    그대로 남는다. 환불도, 포인트 복원도, 기록도 없다.
--
--  금액 규약 (기존 payments_amount_split 제약을 그대로 따른다)
--    gross - discount - commission = payout
--    환불 행은 같은 공식을 **음수** 로 기록해, 행들의 합이 실수취액이 된다.
--
--  포인트와 취소수수료의 관계
--    포인트는 회사가 발행한 보상이고 할인 부담도 플랫폼이 진다(#53 기획 확정).
--    그래서 **포인트는 항상 전액 복원하고, 취소수수료는 현금에서만 뺀다.**
--
--      cash        = max(0, (gross - discount) - fee)
--      refundGross = cash + discount
--
--    수수료가 실제 받은 현금보다 크면 그 차액은 플랫폼 손실로 남는다.
--    할인 부담 원칙과 같은 방향이고, 3분할 제약도 그대로 성립한다.
-- =============================================================

create or replace function public.refund_payment(
  p_payment_id    uuid,
  p_cancel_fee    integer,
  -- 앱이 PG 에 실제로 요청한 취소 금액. 여기서 다시 계산해 어긋나면 거절한다.
  p_expected_cash integer,
  p_memo          text  default null,
  p_raw           jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay        public.payments%rowtype;
  v_existing   public.payments%rowtype;
  v_order      text;
  v_rate       numeric;
  v_fee        integer;
  v_cash       integer;
  v_gross      integer;
  v_discount   integer;
  v_commission integer;
  v_payout     integer;
  v_restored   integer;
  v_refund_id  uuid;
begin
  -- 같은 결제를 두 번 취소하지 않도록 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(p_payment_id::text, 0));

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_pay.type = 'REFUND'::public.payment_type then
    raise exception 'ALREADY_REFUND' using errcode = 'P0001';
  end if;
  if v_pay.status <> 'PAID'::public.payment_status then
    raise exception 'NOT_PAID' using errcode = 'P0001';
  end if;

  v_order := v_pay.order_id || '-R';

  -- 멱등 — PG 취소는 성공했는데 여기서 실패해 재시도하는 경우가 실제로 있다.
  select * into v_existing from public.payments where order_id = v_order;
  if found then
    return jsonb_build_object(
      'already', true,
      'refund_id', v_existing.id,
      'cash', -(v_existing.gross_amount - v_existing.discount_amount),
      'cancel_fee', v_existing.cancel_fee_amount,
      'restored_points', 0
    );
  end if;

  v_rate     := coalesce(v_pay.commission_rate, 0);
  v_discount := v_pay.discount_amount;

  -- 수수료는 실제로 받은 현금을 넘을 수 없다. 넘는 만큼은 플랫폼이 떠안는다.
  v_fee  := least(greatest(coalesce(p_cancel_fee, 0), 0),
                  greatest(v_pay.gross_amount - v_discount, 0));
  v_cash := greatest(0, (v_pay.gross_amount - v_discount) - v_fee);

  if p_expected_cash is distinct from v_cash then
    raise exception 'CASH_MISMATCH expected=% computed=%', p_expected_cash, v_cash
      using errcode = 'P0001';
  end if;

  -- 환불 행 — 원 결제와 같은 공식을 음수로 기록한다.
  v_gross      := v_cash + v_discount;
  v_commission := round(v_gross * v_rate)::integer - v_discount;
  v_payout     := v_gross - v_discount - v_commission;

  insert into public.payments (
    reservation_id, type, status, order_id,
    gross_amount, discount_amount, commission_amount, payout_amount,
    commission_rate, cancel_fee_amount, raw_response, paid_at
  ) values (
    v_pay.reservation_id,
    'REFUND'::public.payment_type,
    'PAID'::public.payment_status,
    v_order,
    -v_gross, -v_discount, -v_commission, -v_payout,
    v_rate,
    -- 명목 수수료가 아니라 **실제로 환불하지 않은 금액**을 남긴다(제19조 ②).
    (v_pay.gross_amount - v_discount) - v_cash,
    p_raw,
    now()
  )
  returning id into v_refund_id;

  -- 포인트는 전액 복원한다. 이미 복원됐으면 0 을 돌려준다(멱등).
  v_restored := public.release_points(p_payment_id, coalesce(p_memo, '예약 취소 환불'));

  -- 환불과 예약 취소가 갈라지면 "돈은 돌려줬는데 예약은 살아 있는" 상태가 된다.
  update public.reservations
     set status = 'CANCELLED'::public.reservation_status,
         confirmed_partner_id = null,
         payment_deadline = null
   where id = v_pay.reservation_id;

  return jsonb_build_object(
    'already', false,
    'refund_id', v_refund_id,
    'cash', v_cash,
    'cancel_fee', (v_pay.gross_amount - v_discount) - v_cash,
    'restored_points', v_restored
  );
end;
$$;

comment on function public.refund_payment(uuid, integer, integer, text, jsonb) is
  '결제를 환불 처리한다. 환불 행 적재 + 포인트 전액 복원 + 예약 CANCELLED 를 한 트랜잭션에서 수행한다. order_id + ''-R'' 기준으로 멱등.';

-- 서버(service_role)만 부른다. 고객이 직접 환불을 일으킬 수 없어야 한다.
revoke all on function public.refund_payment(uuid, integer, integer, text, jsonb)
  from public, anon, authenticated;

-- =============================================================
-- 환불 사고 유형 (#79 원장에 추가)
--
--  환불은 승인과 실패 양상이 다르다.
--    · PG 취소 자체가 실패      → 고객이 환불을 요청했는데 돈이 안 돌아갔다
--    · PG 취소는 됐는데 DB 실패 → 돈은 나갔는데 기록이 없다. 이중 환불 위험
--  뒤쪽이 더 위험하다 — 재시도하면 두 번 환불될 수 있다.
-- =============================================================

alter type public.payment_incident_kind add value if not exists 'REFUND_FAILED';
alter type public.payment_incident_kind add value if not exists 'REFUND_RECORD_FAILED';

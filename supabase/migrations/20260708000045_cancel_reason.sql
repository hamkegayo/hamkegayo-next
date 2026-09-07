-- =============================================================
-- 예약 취소 사유 기록
--
--  이용자가 매칭 화면을 열어 둔 사이 예약이 자동 취소되면, 화면은 계속
--  "매칭 진행 중" 을 보여준다. 상태를 읽지 않기 때문이다. 화면을 고치려면
--  **왜 취소됐는지**를 함께 알려줘야 한다 — "취소되었습니다" 만으로는
--  이용자가 자기가 취소한 것인지 시스템이 취소한 것인지 알 수 없다.
--
--  지금은 사유가 알림 본문에만 문장으로 들어 있어 화면이 판단할 수 없다.
--
--  값은 넷이다.
--    EXPIRED   파트너 미정 상태로 서비스 시작 예정시각이 지남 (자동)
--    USER      이용자가 직접 취소
--    REFUND    결제 후 취소·환불 승인으로 취소
--    ADMIN     운영센터 취소 (경로는 아직 없다. #56 에서 붙는다)
--
--  null 은 "취소된 적 없음" 또는 이 컬럼이 생기기 전의 기존 데이터다.
--  화면은 null 을 "사유 없음" 으로 다뤄야 한다.
-- =============================================================

alter table public.reservations
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at  timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_cancel_reason_chk'
  ) then
    alter table public.reservations
      add constraint reservations_cancel_reason_chk
      check (cancel_reason is null
             or cancel_reason in ('EXPIRED', 'USER', 'REFUND', 'ADMIN'));
  end if;
end $$;

comment on column public.reservations.cancel_reason is
  '취소 사유. EXPIRED(자동 만료) / USER(본인 취소) / REFUND(환불) / ADMIN(운영센터). null 은 취소되지 않았거나 기록 이전의 건이다.';
comment on column public.reservations.cancelled_at is
  '취소 시각. 사유와 함께 기록한다 — 언제 취소됐는지 알아야 분쟁에서 쓸 수 있다.';

-- =============================================================
-- ① 자동 만료 — 사유를 함께 남긴다
--
--  기준은 arrive_time 이다(마이그레이션 44). 계산식을 다시 적지 않고
--  reservation_start_at 을 부른다.
-- =============================================================
create or replace function public.expire_past_matchings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  with expired as (
    update public.reservations
       set status = 'CANCELLED',
           cancel_reason = 'EXPIRED',
           cancelled_at = now()
     where status = 'MATCHING'
       and arrive_time ~ '\d'
       and public.reservation_start_at(use_date, arrive_time) < now()
    returning id, customer_id
  ), notified as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select e.customer_id,
           'RESERVATION_CANCELLED',
           '서비스 시작 시각이 지나 예약이 취소되었어요',
           '파트너가 정해지지 않은 채 서비스 시작 예정시각이 지나 예약이 자동으로 취소되었습니다.',
           '/mypage/reservations/' || e.id::text
      from expired e
    returning 1
  )
  select count(*)::integer into affected from expired;

  return affected;
end;
$$;

comment on function public.expire_past_matchings() is
  '파트너 미정 상태로 서비스 시작 예정시각(arrive_time)이 지난 매칭을 취소하고 이용자에게 알린다. cancel_reason = EXPIRED.';

-- =============================================================
-- ② 환불 승인 취소 — 사유를 함께 남긴다
--
--  refund_payment 안에서 예약을 취소하는 부분만 바뀐다. 나머지 본문은
--  20260708000029_refund.sql 그대로다.
--
--  ⚠️ 이 함수는 돈을 만진다. 여기서는 update 문에 두 컬럼을 더하는 것
--     외에 아무것도 바꾸지 않는다.
-- =============================================================
create or replace function public.set_reservation_cancelled(
  p_reservation_id uuid,
  p_reason         text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reservations
     set status = 'CANCELLED'::public.reservation_status,
         confirmed_partner_id = null,
         payment_deadline = null,
         cancel_reason = p_reason,
         cancelled_at = now()
   where id = p_reservation_id;
$$;

comment on function public.set_reservation_cancelled(uuid, text) is
  '예약을 취소 상태로 바꾸고 사유를 남긴다. 내부 전용 — 취소 경로들이 같은 방식으로 기록하도록 한 곳에 모은다.';

revoke all on function public.set_reservation_cancelled(uuid, text) from public, anon, authenticated;

-- =============================================================
-- ③ 이용자 본인 취소 — 매칭 단계
--
--  앱이 직접 update 하던 것을 RPC 로 옮긴다. 소유자·상태 확인을 서버가
--  하고, 사유도 여기서 붙는다.
-- =============================================================
create or replace function public.cancel_matching_reservation(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_status   public.reservation_status;
begin
  select customer_id, status into v_customer, v_status
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found then return false; end if;
  if v_customer is distinct from auth.uid() then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  -- 확정된 예약은 환불 경로를 타야 한다. 여기서 취소하면 결제가 남는다.
  if v_status <> 'MATCHING'::public.reservation_status then
    return false;
  end if;

  perform public.set_reservation_cancelled(p_reservation_id, 'USER');
  return true;
end;
$$;

comment on function public.cancel_matching_reservation(uuid) is
  '매칭 중인 예약을 이용자가 직접 취소한다. cancel_reason = USER. 확정된 예약은 거절한다 — 환불 경로를 타야 한다.';

revoke all on function public.cancel_matching_reservation(uuid) from public, anon;
grant execute on function public.cancel_matching_reservation(uuid) to authenticated;

-- =============================================================
-- ④ 환불 승인 취소도 같은 방식으로 기록한다
--
--  refund_payment 본문은 20260708000029_refund.sql 원문을 그대로 옮겼고,
--  예약을 취소하던 update 4줄만 set_reservation_cancelled 호출로 바꿨다.
--  손으로 옮겨 적지 않고 원문에서 추출해 치환했다 — 돈을 만지는 함수라
--  한 글자라도 달라지면 안 된다.
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
  perform public.set_reservation_cancelled(v_pay.reservation_id, 'REFUND');

  return jsonb_build_object(
    'already', false,
    'refund_id', v_refund_id,
    'cash', v_cash,
    'cancel_fee', (v_pay.gross_amount - v_discount) - v_cash,
    'restored_points', v_restored
  );
end;
$$;

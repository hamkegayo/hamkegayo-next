-- =============================================================
-- 선결제 승인 지원 RPC — #53
--
--  #49 가 payments·points 원장과 confirm_reservation_payment() 를 만들어 뒀다.
--  여기서는 승인 라우트(app/api/payments/confirm)가 필요로 하는
--  **원자성**과 **잠금**만 채운다.
--
--  왜 RPC 인가 :
--    승인 후 처리는 ① 결제 PAID ② 포인트 사용 ③ 예약 확정 세 가지인데,
--    셋을 따로 호출하면 중간 실패 시 "돈은 빠졌는데 예약은 안 잡힌" 상태가 남는다.
--    한 트랜잭션에 묶어야 한다.
--
--  왜 포인트를 승인 **전에** 선점하는가 :
--    PG 승인액은 gross_amount - discount_amount 다. 승인이 끝난 뒤에 잔액 부족을
--    발견하면 이미 덜 받은 뒤라 되돌릴 수 없다. 그래서 선점 → 승인 → 확정 순서로 간다.
--    승인이 실패하면 USE_CANCEL 로 보상한다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- gross_amount 의 정의를 확정한다 ----------
--  제약식이 gross_amount - discount_amount - commission_amount = payout_amount 이므로
--  gross_amount 는 "고객이 카드로 긁은 금액" 이 아니라 **할인 전 총 청구액**이어야 한다.
--  실제 PG 승인액은 gross_amount - discount_amount 로 파생된다.
comment on column public.payments.gross_amount is
  '총 청구액(할인 전, 원). 실제 PG 승인액은 gross_amount - discount_amount 다. '
  '제약 gross - discount - commission = payout 이 성립하려면 할인 전 금액이어야 한다.';

comment on column public.payments.discount_amount is
  '포인트 등 할인액(원). points 원장의 USE 행 금액과 일치한다(부호는 반대).';

-- =============================================================
-- ① 포인트 선점 — 잔액 검증 + 사용 기록을 원자적으로
--
--   동시 요청이 같은 잔액을 보고 이중 사용하는 것을 막아야 한다.
--   points 는 원장이라 잠글 "잔액 행" 이 없으므로 사용자 단위 advisory 잠금을 쓴다.
--   (profiles 행을 잠그면 무관한 프로필 수정과 교착할 수 있다)
-- =============================================================
create or replace function public.spend_points(
  p_payment_id uuid,
  p_amount integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid;
  v_reserve  uuid;
  v_balance  integer;
  v_point_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select p.reservation_id, r.customer_id
    into v_reserve, v_user
    from public.payments p
    join public.reservations r on r.id = p.reservation_id
   where p.id = p_payment_id;

  if not found then raise exception 'payment_not_found'; end if;

  -- 사용자 단위 직렬화. 트랜잭션 종료 시 자동 해제된다.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- 잠금 안에서 잔액을 다시 읽는다. 이 시점 이후 다른 요청은 대기한다.
  v_balance := public.point_balance(v_user);

  if v_balance < p_amount then
    raise exception 'insufficient_points';
  end if;

  insert into public.points (user_id, amount, reason, reservation_id, payment_id)
  values (v_user, -p_amount, 'USE'::public.point_reason, v_reserve, p_payment_id)
  returning id into v_point_id;

  return v_point_id;
end;
$$;

comment on function public.spend_points(uuid, integer) is
  '결제에 포인트를 선점한다. 사용자 단위 advisory 잠금으로 이중 사용을 막는다. 서버 전용.';

revoke all on function public.spend_points(uuid, integer) from public, anon, authenticated;

-- =============================================================
-- ② 포인트 보상 — 승인 실패·취소 시 복원
--
--   USE 행을 지우지 않고 USE_CANCEL 을 쌓는다. 원장이므로 이력이 남아야 한다.
--   이미 복원된 결제면 아무것도 하지 않는다(멱등).
-- =============================================================
create or replace function public.release_points(
  p_payment_id uuid,
  p_memo text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_reserve uuid;
  v_used   integer;
begin
  -- 이 결제로 사용된 합계(음수)와 이미 복원된 합계(양수)를 함께 본다.
  select p.user_id, p.reservation_id, coalesce(sum(p.amount), 0)
    into v_user, v_reserve, v_used
    from public.points p
   where p.payment_id = p_payment_id
     and p.reason in ('USE'::public.point_reason, 'USE_CANCEL'::public.point_reason)
   group by p.user_id, p.reservation_id;

  -- 사용 이력이 없거나 이미 전부 복원됐으면(합계 0) 할 일이 없다.
  if v_user is null or v_used >= 0 then
    return 0;
  end if;

  insert into public.points (user_id, amount, reason, reservation_id, payment_id, memo)
  values (v_user, -v_used, 'USE_CANCEL'::public.point_reason, v_reserve, p_payment_id, p_memo);

  return -v_used;
end;
$$;

comment on function public.release_points(uuid, text) is
  '결제에 선점된 포인트를 USE_CANCEL 로 복원한다. 이미 복원됐으면 0 을 반환(멱등). 서버 전용.';

revoke all on function public.release_points(uuid, text) from public, anon, authenticated;

-- =============================================================
-- ③ 승인 확정 — 결제 PAID 전이와 예약 확정을 한 트랜잭션에
--
--   PG 승인이 끝난 직후 호출한다. 여기서 예외가 나면 라우트가 PG 승인을 취소한다.
--   이미 PAID 인 결제를 다시 호출해도 안전하다(멱등) — 승인 응답이 중복 도착하거나
--   사용자가 새로고침하는 경우가 있다.
-- =============================================================
create or replace function public.finalize_payment(
  p_payment_id     uuid,
  p_transaction_id text,
  p_paid_at        timestamptz,
  p_receipt_url    text default null,
  p_raw            jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserve uuid;
  v_status  public.payment_status;
  v_type    public.payment_type;
begin
  select reservation_id, status, type
    into v_reserve, v_status, v_type
    from public.payments
   where id = p_payment_id
   for update;

  if not found then raise exception 'payment_not_found'; end if;

  if v_status = 'PAID'::public.payment_status then
    -- 이미 확정된 결제. 예약 상태만 확인하고 조용히 끝낸다.
    return;
  end if;

  if v_status <> 'PENDING'::public.payment_status then
    raise exception 'payment_not_pending';
  end if;

  update public.payments
     set status         = 'PAID'::public.payment_status,
         transaction_id = p_transaction_id,
         paid_at        = coalesce(p_paid_at, now()),
         raw_response   = coalesce(p_raw, raw_response),
         pay_token      = null,           -- 링크 결제였다면 토큰을 소진시킨다(1회용)
         token_expires_at = null
   where id = p_payment_id;

  -- 영수증 URL 은 raw_response 에 남지만 마이페이지에서 바로 쓰도록 별도 보관한다.
  if p_receipt_url is not null then
    update public.payments
       set raw_response = coalesce(raw_response, '{}'::jsonb)
                          || jsonb_build_object('receiptUrl', p_receipt_url)
     where id = p_payment_id;
  end if;

  -- 선결제만 예약을 확정시킨다. 추가결제(EXTENSION)는 이미 CONFIRMED 인 예약에 붙는다.
  if v_type = 'BASE'::public.payment_type then
    perform public.confirm_reservation_payment(v_reserve, p_payment_id);
  end if;
end;
$$;

comment on function public.finalize_payment(uuid, text, timestamptz, text, jsonb) is
  'PG 승인 후 결제를 PAID 로 전이하고 선결제면 예약을 확정한다. 한 트랜잭션·멱등. 서버 전용.';

revoke all on function public.finalize_payment(uuid, text, timestamptz, text, jsonb)
  from public, anon, authenticated;

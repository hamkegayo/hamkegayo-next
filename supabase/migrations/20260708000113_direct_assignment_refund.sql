-- =============================================================
-- 선결제 후 운영자 직접 배정 흐름 (#300) 3/4 — 배정 전 전액 환불·매칭 실패·환불 상태 분리
--
--  ⚠️ 약관 대조: 배정 전 고객 취소·운영자 매칭 실패 시 **전액 환불**은 제19조 취소수수료 표와 별개의
--     운영 기준(사용자 확정 2026-11-19)이다. 현재 공개 약관에 근거 조항이 없다. 구현 우선 진행,
--     추후 정책 개선 예정이며 출시 전 약관 개정·고지가 필요하다.
--     배정 이후(CONFIRMED) 취소는 기존 cancelConfirmedReservation → refund_payment(제19조 수수료) 경로를 그대로 쓴다.
--
--  상태를 둘로 나눈다
--    · 예약 상태       reservations.status / cancel_reason / match_failed_at   (취소·매칭 실패)
--    · 환불 처리 상태  reservation_refunds.status                               (PG 취소·원장 기록)
--  PG 취소가 실패해도 예약은 CANCELLED 로 닫혀 더 이상 배정되지 않지만(배정과 환불의 경쟁 차단),
--  환불은 REFUNDED 가 될 때까지 "환불 대기/실패" 로 남아 재시도·운영자 추적 대상이 된다. 환불 완료로
--  표시하는 것은 PG 취소 성공 뒤 complete_direct_refund 뿐이다(기존 refund_payment 와 같은 원칙).
--
--  원장 일관성 — 기록은 기존 refund_payment(수수료 0) 를 그대로 쓴다.
--    · REFUND 결제 행(-gross, -discount …)과 order_id + '-R' 멱등 키
--    · 포인트는 release_points 로 USE_CANCEL 전액 복원(멱등)
--    · 이벤트 쿠폰(USED)은 행사가 끝나지 않았다면 RELEASED 로 되돌려 선착순 자리를 반환한다.
--      행사 종료 후에는 복원하지 않고 생략 사실을 이력에 남긴다(#297).
--    · 적립 포인트는 서비스 완료 후에만 쌓이므로 배정 전에는 취소할 적립이 없다. 있다면 자동 처리하지 않는다.
-- =============================================================

alter table public.reservations
  add column if not exists failure_notice_method text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_failure_notice_method_chk') then
    alter table public.reservations add constraint reservations_failure_notice_method_chk
      check (failure_notice_method is null or failure_notice_method in ('PHONE', 'SMS', 'KAKAO', 'EMAIL', 'OTHER'));
  end if;
end $$;

create table if not exists public.reservation_refunds (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null unique references public.reservations (id),
  payment_id      uuid not null unique references public.payments (id),
  reason          text not null check (reason in ('CUSTOMER_CANCEL', 'MATCH_FAILED')),
  status          text not null default 'REQUESTED'
                  check (status in ('REQUESTED', 'PROCESSING', 'PG_FAILED', 'REFUNDED')),
  amount_cash     integer not null check (amount_cash >= 0),
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  lease_until     timestamptz,
  last_error      text,
  pg_cancelled_at timestamptz,
  pg_raw          jsonb,
  coupon_restored boolean not null default false,
  coupon_restore_skipped boolean not null default false,
  requested_by    uuid references public.profiles (id) on delete set null,
  requested_at    timestamptz not null default now(),
  completed_at    timestamptz,
  check ((status = 'REFUNDED') = (completed_at is not null))
);

comment on table public.reservation_refunds is
  '배정 전 전액 환불 처리 상태. 예약 취소·매칭 실패 상태와 PG 환불 상태를 분리한다. PG 취소 실패는 PG_FAILED 로 남아 재시도·추적 대상이 되고, REFUNDED 는 PG 취소 성공 후 원장 기록까지 끝난 뒤에만 된다.';

alter table public.reservation_refunds enable row level security;
revoke all on public.reservation_refunds from anon, authenticated;
grant select on public.reservation_refunds to authenticated;
drop policy if exists "reservation_refunds_select_admin" on public.reservation_refunds;
create policy "reservation_refunds_select_admin"
  on public.reservation_refunds for select using (public.can_manage_reservations());

-- ---------- 환불 시작 (내부) ----------
--  예약 행을 잠가 배정과 경쟁을 정리한다. 이미 환불 행이 있으면 그대로 돌려준다(재요청 멱등).
create or replace function public.begin_direct_refund(
  p_reservation uuid, p_reason text, p_reason_text text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r   public.reservations%rowtype;
  pay public.payments%rowtype;
  f   public.reservation_refunds%rowtype;
  v_cash integer;
begin
  select * into r from public.reservations where id = p_reservation for update;
  if not found or r.matching_mode <> 'admin_direct' then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;

  select * into f from public.reservation_refunds where reservation_id = r.id;
  if found then
    return jsonb_build_object('refund_id', f.id, 'status', f.status, 'amount_cash', f.amount_cash, 'already', true);
  end if;

  -- 배정 전(미배정 매칭 대기)만 전액 환불한다. 확정 이후는 제19조 수수료 경로다.
  if r.status <> 'MATCHING'::public.reservation_status or r.paid_at is null or r.confirmed_partner_id is not null then
    raise exception 'not_refundable_before_assignment' using errcode = '23514';
  end if;

  select * into pay from public.payments
   where reservation_id = r.id and type = 'BASE'::public.payment_type and status = 'PAID'::public.payment_status
   for update;
  if not found then raise exception 'payment_not_paid' using errcode = '23514'; end if;

  v_cash := greatest(pay.gross_amount - pay.discount_amount, 0);

  perform public.set_reservation_cancelled(r.id, case p_reason when 'CUSTOMER_CANCEL' then 'USER' else 'ADMIN' end);
  if p_reason = 'MATCH_FAILED' then
    update public.reservations
       set match_failed_at = now(), match_failed_by = auth.uid(), match_failure_reason = p_reason_text
     where id = r.id;
  end if;

  insert into public.reservation_refunds (reservation_id, payment_id, reason, amount_cash, requested_by)
  values (r.id, pay.id, p_reason, v_cash, auth.uid())
  returning * into f;

  if p_reason = 'MATCH_FAILED' then
    perform public.record_reservation_event(r.id, 'MATCH_FAILED', jsonb_build_object('reason', p_reason_text));
  else
    perform public.record_reservation_event(r.id, 'CUSTOMER_CANCELLED', '{}'::jsonb);
  end if;
  perform public.record_reservation_event(r.id, 'REFUND_REQUESTED',
    jsonb_build_object('refund_id', f.id, 'amount_cash', v_cash, 'reason', p_reason));

  return jsonb_build_object('refund_id', f.id, 'status', f.status, 'amount_cash', f.amount_cash, 'already', false);
end $$;
revoke all on function public.begin_direct_refund(uuid, text, text) from public, anon, authenticated;

-- ---------- 고객: 배정 전 취소 ----------
create or replace function public.customer_cancel_before_assignment(p_reservation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_customer uuid;
begin
  select customer_id into v_customer from public.reservations where id = p_reservation;
  if not found or v_customer is distinct from auth.uid() then raise exception 'not_owner' using errcode = '42501'; end if;
  return public.begin_direct_refund(p_reservation, 'CUSTOMER_CANCEL', null);
end $$;
revoke all on function public.customer_cancel_before_assignment(uuid) from public, anon;
grant execute on function public.customer_cancel_before_assignment(uuid) to authenticated;

-- ---------- 관리자: 매칭 실패 처리 ----------
create or replace function public.admin_fail_matching(p_reservation uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_reason text := btrim(coalesce(p_reason, '')); v jsonb;
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_reason) not between 5 and 500 then raise exception 'invalid_reason' using errcode = '22023'; end if;
  v := public.begin_direct_refund(p_reservation, 'MATCH_FAILED', v_reason);
  perform public.log_access('RESERVATION_MATCH_FAILED', 'reservations', p_reservation,
    (select customer_id from public.reservations where id = p_reservation), v_reason);
  return v;
end $$;
revoke all on function public.admin_fail_matching(uuid, text) from public, anon;
grant execute on function public.admin_fail_matching(uuid, text) to authenticated;

-- ---------- 관리자: 환불 재시도 승인 ----------
-- PG 취소 실패(PG_FAILED)나 워커가 죽어 임대가 만료된 PROCESSING 건을 다시 시도할 수 있게 연다.
create or replace function public.admin_retry_direct_refund(p_reservation uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.reservation_refunds%rowtype;
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into f from public.reservation_refunds where reservation_id = p_reservation for update;
  if not found then raise exception 'refund_not_found' using errcode = 'P0002'; end if;
  if f.status = 'REFUNDED' then return f.id; end if;
  if f.status = 'PROCESSING' and f.lease_until > now() then raise exception 'refund_in_progress' using errcode = '23514'; end if;
  update public.reservation_refunds set status = 'REQUESTED', lease_until = null where id = f.id;
  perform public.record_reservation_event(p_reservation, 'REFUND_RETRY', jsonb_build_object('refund_id', f.id));
  perform public.log_access('RESERVATION_REFUND_RETRY', 'reservations', p_reservation, null, '환불 재시도');
  return f.id;
end $$;
revoke all on function public.admin_retry_direct_refund(uuid) from public, anon;
grant execute on function public.admin_retry_direct_refund(uuid) to authenticated;

-- ---------- 서버(service_role): 환불 실행 단계 ----------
--  claim → (PG 취소) → mark_pg_done → complete. 단계마다 상태가 남아 어디서 끊겨도 이어서 할 수 있다.
--  claim 의 임대(3분)가 같은 환불의 동시 PG 호출(중복 환불)을 막는다.
create or replace function public.claim_direct_refund(p_refund uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.reservation_refunds%rowtype; pay public.payments%rowtype; v_code text;
begin
  select * into f from public.reservation_refunds where id = p_refund for update;
  if not found then raise exception 'refund_not_found' using errcode = 'P0002'; end if;
  if f.status = 'REFUNDED' then
    return jsonb_build_object('proceed', false, 'status', f.status);
  end if;
  if f.status = 'PROCESSING' and f.lease_until > now() then
    return jsonb_build_object('proceed', false, 'status', f.status);
  end if;
  select * into pay from public.payments where id = f.payment_id;
  select code into v_code from public.reservations where id = f.reservation_id;
  update public.reservation_refunds
     set status = 'PROCESSING', attempts = attempts + 1, last_attempt_at = now(),
         lease_until = now() + interval '3 minutes'
   where id = f.id;
  return jsonb_build_object('proceed', true, 'status', 'PROCESSING',
    'pg_done', f.pg_cancelled_at is not null, 'amount_cash', f.amount_cash,
    'full_cash', greatest(pay.gross_amount - pay.discount_amount, 0),
    'order_id', pay.order_id, 'transaction_id', pay.transaction_id,
    'payment_id', pay.id, 'reservation_id', f.reservation_id, 'reservation_code', v_code,
    'attempts', f.attempts + 1);
end $$;
revoke all on function public.claim_direct_refund(uuid) from public, anon, authenticated;
grant execute on function public.claim_direct_refund(uuid) to service_role;

create or replace function public.mark_direct_refund_pg_done(p_refund uuid, p_raw jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.reservation_refunds
     set pg_cancelled_at = coalesce(pg_cancelled_at, now()), pg_raw = coalesce(p_raw, pg_raw), last_error = null
   where id = p_refund and status <> 'REFUNDED';
end $$;
revoke all on function public.mark_direct_refund_pg_done(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mark_direct_refund_pg_done(uuid, jsonb) to service_role;

create or replace function public.fail_direct_refund(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.reservation_refunds%rowtype;
begin
  select * into f from public.reservation_refunds where id = p_refund for update;
  if not found or f.status = 'REFUNDED' then return; end if;
  update public.reservation_refunds
     set status = 'PG_FAILED', lease_until = null, last_error = left(coalesce(p_error, 'unknown'), 300)
   where id = p_refund;
  insert into public.reservation_events (reservation_id, event_type, actor_role, detail)
  values (f.reservation_id, 'REFUND_PG_FAILED', 'SYSTEM',
          jsonb_build_object('refund_id', f.id, 'attempts', f.attempts, 'error', left(coalesce(p_error, 'unknown'), 300)));
end $$;
revoke all on function public.fail_direct_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_direct_refund(uuid, text) to service_role;

-- 원장 기록 — PG 취소가 끝난 뒤(또는 현금 0원)에만 REFUNDED 가 된다.
create or replace function public.complete_direct_refund(p_refund uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f   public.reservation_refunds%rowtype;
  res jsonb;
  cl  public.opening_event_claims%rowtype;
  v_restored boolean := false;
  v_skipped  boolean := false;
begin
  select * into f from public.reservation_refunds where id = p_refund for update;
  if not found then raise exception 'refund_not_found' using errcode = 'P0002'; end if;
  if f.status = 'REFUNDED' then
    return jsonb_build_object('already', true, 'cash', f.amount_cash);
  end if;
  if f.pg_cancelled_at is null and f.amount_cash > 0 then
    raise exception 'pg_cancel_required' using errcode = '23514';
  end if;
  -- 배정 전에는 적립이 없어야 한다. 있으면 자동 처리하지 않고 사람이 보게 한다.
  if exists (select 1 from public.points where reservation_id = f.reservation_id
              and reason = 'EARN_PAYMENT'::public.point_reason) then
    raise exception 'earn_exists_requires_review' using errcode = '23514';
  end if;

  -- 환불 행·포인트 전액 복원·예약 취소 — 기존 원장 함수를 수수료 0 으로 쓴다(order_id + '-R' 멱등).
  res := public.refund_payment(f.payment_id, 0, f.amount_cash,
           case f.reason when 'MATCH_FAILED' then '매칭 실패 전액 환불' else '배정 전 고객 취소 전액 환불' end,
           f.pg_raw);

  -- 이벤트 쿠폰: 사용 처리(USED)였다면 행사 진행 중에 한해 자리를 돌려준다.
  perform 1 from public.opening_campaign where id for update;
  select * into cl from public.opening_event_claims where payment_id = f.payment_id for update;
  if found and cl.state = 'USED' then
    if public.opening_event_ended() then
      v_skipped := true;
    else
      update public.opening_event_claims
         set state = 'RELEASED', restored_at = now(), restored_sequence = sequence,
             restored_confirmed_at = confirmed_at, restored_by = null,
             restored_reason = '배정 전 전액 환불', sequence = null, confirmed_at = null
       where id = cl.id;
      update public.opening_campaign set used_count = greatest(used_count - 1, 0), updated_at = now() where id;
      v_restored := true;
    end if;
  end if;

  update public.reservation_refunds
     set status = 'REFUNDED', completed_at = now(), lease_until = null, last_error = null,
         coupon_restored = v_restored, coupon_restore_skipped = v_skipped
   where id = f.id;

  insert into public.reservation_events (reservation_id, event_type, actor_role, detail)
  values (f.reservation_id, 'REFUND_COMPLETED', 'SYSTEM', jsonb_build_object(
    'refund_id', f.id, 'cash', f.amount_cash, 'restored_points', res ->> 'restored_points',
    'coupon_restored', v_restored, 'coupon_restore_skipped', v_skipped));

  return jsonb_build_object('already', false, 'cash', f.amount_cash,
    'restored_points', (res ->> 'restored_points')::integer,
    'coupon_restored', v_restored, 'coupon_restore_skipped', v_skipped);
end $$;
revoke all on function public.complete_direct_refund(uuid) from public, anon, authenticated;
grant execute on function public.complete_direct_refund(uuid) to service_role;

-- ---------- 관리자: 실패 안내 완료 기록 ----------
-- 매칭 실패 안내는 운영자가 직접 한다. 방법·시각·수행자·메모를 남긴다(한 번만, 멱등).
create or replace function public.admin_record_failure_notice(
  p_reservation uuid, p_method text, p_memo text default null
)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_method is null or p_method not in ('PHONE', 'SMS', 'KAKAO', 'EMAIL', 'OTHER') then
    raise exception 'invalid_method' using errcode = '22023';
  end if;
  if v_memo is not null and char_length(v_memo) > 500 then raise exception 'memo_too_long' using errcode = '22023'; end if;
  select * into r from public.reservations where id = p_reservation for update;
  if not found or r.matching_mode <> 'admin_direct' or r.match_failed_at is null then
    raise exception 'not_match_failed' using errcode = '23514';
  end if;
  if r.failure_notice_at is not null then return r.failure_notice_at; end if;
  update public.reservations
     set failure_notice_at = now(), failure_notice_by = auth.uid(),
         failure_notice_method = p_method, failure_notice_memo = v_memo
   where id = r.id;
  perform public.record_reservation_event(r.id, 'FAILURE_NOTICE_DONE', jsonb_build_object('method', p_method, 'memo', v_memo));
  perform public.log_access('RESERVATION_FAILURE_NOTICE', 'reservations', r.id, r.customer_id, '매칭 실패 고객 안내 완료 기록');
  return now();
end $$;
revoke all on function public.admin_record_failure_notice(uuid, text, text) from public, anon;
grant execute on function public.admin_record_failure_notice(uuid, text, text) to authenticated;

-- ---------- 관리자: 환불·안내 추적 목록 ----------
-- 환불이 끝나지 않은 건(REQUESTED·PROCESSING·PG_FAILED)과 실패 안내가 아직 기록되지 않은 매칭 실패 건.
create or replace function public.admin_list_direct_refund_issues()
returns table (
  reservation_id uuid, code text, reason text, refund_status text, amount_cash integer,
  attempts integer, last_error text, requested_at timestamptz,
  match_failed_at timestamptz, failure_notice_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.log_access('RESERVATION_REFUND_ISSUES', 'reservation_refunds', null, null, '환불·안내 추적 목록 조회');
  return query
    select f.reservation_id, r.code, f.reason, f.status, f.amount_cash, f.attempts, f.last_error,
           f.requested_at, r.match_failed_at, r.failure_notice_at
      from public.reservation_refunds f
      join public.reservations r on r.id = f.reservation_id
     where f.status <> 'REFUNDED'
        or (r.match_failed_at is not null and r.failure_notice_at is null)
     order by f.requested_at;
end $$;
revoke all on function public.admin_list_direct_refund_issues() from public, anon;
grant execute on function public.admin_list_direct_refund_issues() to authenticated;

-- ---------- 관리자: PG 취소 수동 확인 ----------
-- PG 응답이 유실돼(indeterminate) 취소 성공 여부를 알 수 없을 때, 운영자가 PG 콘솔에서 취소 완료를
-- 직접 확인한 뒤 기록한다. 이후 재시도는 PG 를 다시 부르지 않고 원장 기록(complete)만 이어서 한다.
-- 같은 거래를 두 번 취소하려는 시도(이중 환불)를 피하기 위한 운영 경로다.
create or replace function public.admin_mark_refund_pg_cancelled(p_reservation uuid, p_memo text)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.reservation_refunds%rowtype; v_memo text := btrim(coalesce(p_memo, ''));
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_memo) not between 5 and 500 then raise exception 'invalid_memo' using errcode = '22023'; end if;
  select * into f from public.reservation_refunds where reservation_id = p_reservation for update;
  if not found then raise exception 'refund_not_found' using errcode = 'P0002'; end if;
  if f.status = 'REFUNDED' or (f.status = 'PROCESSING' and f.lease_until > now()) then
    raise exception 'refund_not_markable' using errcode = '23514';
  end if;
  update public.reservation_refunds
     set pg_cancelled_at = coalesce(pg_cancelled_at, now()),
         pg_raw = coalesce(pg_raw, jsonb_build_object('manual_confirmation', v_memo)),
         status = 'REQUESTED', lease_until = null
   where id = f.id;
  perform public.record_reservation_event(p_reservation, 'REFUND_RETRY',
    jsonb_build_object('refund_id', f.id, 'manual_pg_confirmed', true, 'memo', v_memo));
  perform public.log_access('RESERVATION_REFUND_PG_CONFIRMED', 'reservations', p_reservation, null, v_memo);
end $$;
revoke all on function public.admin_mark_refund_pg_cancelled(uuid, text) from public, anon;
grant execute on function public.admin_mark_refund_pg_cancelled(uuid, text) to authenticated;

-- ---------- 결제 완료 신규 방식 예약은 일반 취소 RPC 로 취소할 수 없다 ----------
-- cancel_matching_reservation(45) 은 결제 없이 매칭 중인 예약을 닫는 용도다. 신규 방식은 결제 후에도
-- MATCHING 이므로 그대로 두면 돈을 받은 채 예약만 취소된다. 환불 경로(customer_cancel_before_assignment)로만 취소한다.
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
  v_mode     text;
  v_paid_at  timestamptz;
begin
  select customer_id, status, matching_mode, paid_at into v_customer, v_status, v_mode, v_paid_at
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
  if v_mode = 'admin_direct' and v_paid_at is not null then
    return false;
  end if;

  perform public.set_reservation_cancelled(p_reservation_id, 'USER');
  return true;
end;
$$;

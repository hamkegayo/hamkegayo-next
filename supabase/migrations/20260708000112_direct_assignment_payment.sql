-- =============================================================
-- 선결제 후 운영자 직접 배정 흐름 (#300) 2/4 — 미배정 선결제·매칭 대기·운영자 접수 알림
--
--  ⚠️ 약관 대조: 제9조 ④⑤ 는 "파트너 선택 → 선결제 → 예약 확정" 순서를 전제한다.
--     신규 방식(admin_direct)은 선결제 → 매칭 대기 → 운영자 배정 → 확정이라 순서가 다르다.
--     구현 우선 진행, 추후 정책 개선 예정(2026-11-19 사용자 확정). 출시 전 약관 개정·고지 필요.
--     기존 방식(legacy_auto)은 finalize_payment → confirm_reservation_payment 경로가 그대로다.
--
--  · 결제 성공(PAID, 매칭 대기)과 예약 확정(CONFIRMED)을 분리한다.
--    finalize_payment 는 신규 방식이면 mark_reservation_paid 를 불러 paid_at 과 운영자 접수 행을
--    **같은 트랜잭션에** 남긴다. 승인·저장이 실패하면(예외) 접수도 알림도 남지 않는다.
--  · 포인트·이벤트 쿠폰의 "파트너 선택 전제" 를 신규 방식에서는 풀어 미배정 선결제를 허용한다.
--    쿠폰 확정(commit_opening_event_payment 트리거)은 결제 PAID 전이에서 그대로 동작한다.
-- =============================================================

-- ---------- 운영자 접수 알림 큐 ----------
-- 결제당·예약당 한 행(unique) → 재콜백·재요청에도 중복 접수·중복 알림이 없다.
create table if not exists public.reservation_intakes (
  id               uuid primary key default gen_random_uuid(),
  reservation_id   uuid not null unique references public.reservations (id) on delete cascade,
  payment_id       uuid not null unique references public.payments (id),
  notify_status    text not null default 'PENDING'
                   check (notify_status in ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_attempt_at  timestamptz,
  last_error       text,
  sent_at          timestamptz,
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references public.profiles (id) on delete set null,
  acknowledge_memo text,
  created_at       timestamptz not null default now()
);

comment on table public.reservation_intakes is
  '신규 방식 예약의 운영자 접수 기록. 결제 승인·저장과 같은 트랜잭션에서 만들고, 이메일 발송 상태·재시도·운영자 접수 확인을 관리한다. 이메일 본문에는 접수 사실과 관리자 링크만 쓴다(예약 상세·건강정보 제외).';

create index if not exists idx_reservation_intakes_dispatch
  on public.reservation_intakes (next_attempt_at)
  where notify_status in ('PENDING', 'FAILED', 'SENDING');

alter table public.reservation_intakes enable row level security;
revoke all on public.reservation_intakes from anon, authenticated;
grant select on public.reservation_intakes to authenticated;
drop policy if exists "reservation_intakes_select_admin" on public.reservation_intakes;
create policy "reservation_intakes_select_admin"
  on public.reservation_intakes for select using (public.can_manage_reservations());

-- =============================================================
-- 쿠폰의 파트너 선택 전제 해제 (신규 방식만)
--   103·110 번 본문에서 파트너 선택 조건만 바뀐다.
-- =============================================================
create or replace function public.opening_event_live_hold(p_payment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.payments p join public.reservations r on r.id=p.reservation_id
    where p.id=p_payment_id and p.status='PENDING' and r.status='MATCHING'
      and (r.matching_mode='admin_direct' or r.confirmed_partner_id is not null)
      and r.payment_deadline>now());
$$;
revoke all on function public.opening_event_live_hold(uuid) from public,anon,authenticated;


-- 106 과 같은 검증 순서에 종료 시각 검사, 서비스별 금액, 확보 만료 상한을 더한다.
create or replace function public.reserve_opening_event(p_payment_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype;
  c public.opening_campaign%rowtype; identity public.opening_event_identities%rowtype;
  amount integer; hour_amount integer; existing public.opening_event_claims%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.type<>'BASE' or p.status<>'PENDING' then raise exception 'invalid_payment' using errcode='23514'; end if;
  select * into r from public.reservations where id=p.reservation_id;
  if r.status<>'MATCHING' or (r.matching_mode='legacy_auto' and r.confirmed_partner_id is null) or r.payment_deadline is null or r.payment_deadline<=now() then
    raise exception 'invalid_reservation' using errcode='23514';
  end if;
  select * into c from public.opening_campaign where id for update;
  -- 실패/만료된 임시 확보는 선착순 사용 인원에 포함하지 않는다.
  update public.opening_event_claims set state='RELEASED'
    where state='HELD' and (expires_at<=now() or not public.opening_event_live_hold(payment_id));
  -- 종료 후에는 기존 확보분도 결제로 이어 가지 않는다.
  if now()>=c.ends_at then raise exception 'campaign_ended' using errcode='23514'; end if;
  if c.used_count>=c.capacity then raise exception 'campaign_full' using errcode='23514'; end if;
  if not c.active or not c.integration_ready or c.closed_at is not null then raise exception 'campaign_unavailable' using errcode='23514'; end if;
  select * into existing from public.opening_event_claims where payment_id=p.id;
  -- 전환 전에 확보한 결제는 확보 금액(예: Basic 25,000원)을 유지한다.
  if found and existing.state='HELD' then return existing.discount_amount; end if;
  if exists (select 1 from public.opening_event_claims where payment_id=p.id) then
    raise exception 'claim_expired' using errcode='23514';
  end if;
  select * into identity from public.opening_event_identities where customer_id=r.customer_id;
  if not public.opening_event_customer_eligible(r.customer_id)
    or exists (select 1 from public.opening_event_claims where state in ('HELD','USED')
      and (customer_id=r.customer_id or identity_hash=identity.identity_hash)) then
    raise exception 'campaign_ineligible' using errcode='23514';
  end if;
  if c.used_count+(select count(*) from public.opening_event_claims where state='HELD')>=c.capacity then
    raise exception 'campaign_capacity_held' using errcode='23514';
  end if;
  if p.discount_amount<>0 or exists (select 1 from public.points where payment_id=p.id and reason='USE') then
    raise exception 'campaign_not_stackable' using errcode='23514';
  end if;
  -- 쿠폰액은 예약 서비스의 최초 1시간 요금 고정액이다. 할증률을 곱하지 않는다.
  amount := public.opening_event_discount(r.plan);
  hour_amount := case r.plan when 'plus' then 25000 else 20000 end;
  if amount is null or coalesce(r.duration_minutes,120)<120 or p.gross_amount<=amount
    or p.gross_amount<>round(round(hour_amount*greatest(coalesce(r.duration_minutes,120),120)/60.0)*(1+coalesce(r.surcharge_rate,0))) then
    raise exception 'campaign_invalid_amount' using errcode='23514';
  end if;
  -- 확보 만료는 종료 시각을 넘지 않는다. 종료 시각까지 확정되지 않은 결제는 쿠폰 적용에 실패한다.
  insert into public.opening_event_claims(customer_id,identity_hash,payment_id,reservation_id,discount_amount,expires_at)
    values(r.customer_id,identity.identity_hash,p.id,r.id,amount,least(greatest(r.payment_deadline,now()+interval '10 minutes'),c.ends_at));
  -- 할인은 회사 부담. 정상 지급액을 유지하고 회사 수수료만 줄인다.
  update public.payments set campaign_discount_amount=amount, discount_amount=amount,
    commission_amount=commission_amount-amount where id=p.id;
  return amount;
end $$;
revoke all on function public.reserve_opening_event(uuid) from public, anon, authenticated;
grant execute on function public.reserve_opening_event(uuid) to service_role;

-- 쿠폰 적용 가능 판정도 같은 기준으로 맞춘다.
create or replace function public.opening_event_offer(p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.reservations%rowtype; coupon jsonb; applicable boolean;
begin
  select * into r from public.reservations where id=p_reservation_id and customer_id=auth.uid();
  if not found then raise exception 'not_found' using errcode='42501'; end if;
  coupon:=public.opening_event_coupon();
  applicable:=r.status='MATCHING' and (r.matching_mode='admin_direct' or r.confirmed_partner_id is not null) and r.payment_deadline>now() and (coupon->>'state'='AVAILABLE'
    or (coupon->>'state'='HELD' and coupon->>'reservationId'=r.id::text));
  -- 재시도의 이전 HELD는 prepare에서 해제한 뒤 이 서비스 금액으로 다시 확보한다.
  return coupon || jsonb_build_object('eligible',coalesce(applicable,false),'discount',public.opening_event_discount(r.plan));
end $$;
revoke all on function public.opening_event_offer(uuid) from public,anon;
grant execute on function public.opening_event_offer(uuid) to authenticated;

-- =============================================================
-- 신규 방식 결제 완료 → 매칭 대기
--   예약 행을 잠그고 상태를 확인한 뒤 paid_at 과 접수 행을 남긴다. 멱등이다.
-- =============================================================
create or replace function public.mark_reservation_paid(
  p_reservation_id uuid,
  p_payment_id     uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status   public.reservation_status;
  v_mode     text;
  v_use_date date;
  v_paid_at  timestamptz;
  v_res_paid timestamptz;
  v_customer uuid;
  v_pay_status public.payment_status;
begin
  select status, matching_mode, use_date, paid_at, customer_id
    into v_status, v_mode, v_use_date, v_res_paid, v_customer
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found then raise exception 'reservation_not_found'; end if;
  if v_mode <> 'admin_direct' then raise exception 'not_admin_direct'; end if;

  select status, paid_at into v_pay_status, v_paid_at
    from public.payments
   where id = p_payment_id and reservation_id = p_reservation_id
     and type = 'BASE'::public.payment_type;
  if v_pay_status is distinct from 'PAID'::public.payment_status then
    raise exception 'payment_not_paid';
  end if;

  -- 같은 결제의 재호출 — 이미 접수돼 있으면 아무것도 하지 않는다.
  if exists (select 1 from public.reservation_intakes where payment_id = p_payment_id) then
    return;
  end if;
  -- 다른 결제로 이미 매칭 대기에 들어간 예약에 두 번째 선결제가 들어오면 거절한다(이중 결제 방지).
  if v_res_paid is not null then raise exception 'already_paid'; end if;

  -- 결제 승인 사이에 고객이 취소했거나 만료돼 CANCELLED 가 됐다면 확정하지 않는다.
  -- 예외를 내면 승인 라우트가 PG 승인을 취소한다.
  if v_status <> 'MATCHING'::public.reservation_status then raise exception 'not_matching'; end if;

  if v_use_date >
     ((coalesce(v_paid_at, now()) at time zone 'Asia/Seoul')::date + 59)
  then
    raise exception 'reservation_date_out_of_range';
  end if;

  update public.reservations
     set paid_at = coalesce(v_paid_at, now()),
         payment_deadline = null
   where id = p_reservation_id;

  insert into public.reservation_intakes (reservation_id, payment_id)
  values (p_reservation_id, p_payment_id)
  on conflict do nothing;

  insert into public.reservation_events (reservation_id, event_type, actor_role, detail)
  values (p_reservation_id, 'PAID', 'SYSTEM', jsonb_build_object('payment_id', p_payment_id));

  -- 고객 알림 — 확정이 아니라 접수 안내다. 같은 예약에 한 번만.
  insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
  values (v_customer, 'RESERVATION_RECEIVED', '예약 신청과 결제가 접수되었어요',
          '동행 파트너를 확인하고 있어요. 24시간 이내에 진행 결과를 안내드릴게요. 배정이 어려우면 결제 금액은 전액 환불됩니다.',
          '/mypage/reservations/' || p_reservation_id::text,
          'direct-received:' || p_reservation_id::text)
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

comment on function public.mark_reservation_paid(uuid, uuid) is
  '신규 방식 선결제 승인 후 매칭 대기로 전이하고 운영자 접수 행을 만든다. 확정하지 않는다. 한 트랜잭션·멱등. 서버 전용(#300).';
revoke all on function public.mark_reservation_paid(uuid, uuid) from public, anon, authenticated;

-- finalize_payment — 24 번 본문에서 BASE 분기만 방식별로 갈라진다.
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
  v_mode    text;
begin
  select reservation_id, status, type
    into v_reserve, v_status, v_type
    from public.payments
   where id = p_payment_id
   for update;

  if not found then raise exception 'payment_not_found'; end if;

  if v_status = 'PAID'::public.payment_status then
    -- 이미 처리된 결제(재콜백·새로고침). 신규 방식이면 접수가 빠져 있지 않은지만 보강한다(멱등).
    if v_type = 'BASE'::public.payment_type then
      select matching_mode into v_mode from public.reservations where id = v_reserve;
      if v_mode = 'admin_direct' then
        perform public.mark_reservation_paid(v_reserve, p_payment_id);
      end if;
    end if;
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
         pay_token      = null,
         token_expires_at = null
   where id = p_payment_id;

  if p_receipt_url is not null then
    update public.payments
       set raw_response = coalesce(raw_response, '{}'::jsonb)
                          || jsonb_build_object('receiptUrl', p_receipt_url)
     where id = p_payment_id;
  end if;

  if v_type = 'BASE'::public.payment_type then
    select matching_mode into v_mode from public.reservations where id = v_reserve;
    if v_mode = 'admin_direct' then
      -- 결제 성공 ≠ 예약 확정. 매칭 대기로 두고 운영자 접수 행을 남긴다.
      perform public.mark_reservation_paid(v_reserve, p_payment_id);
    else
      perform public.confirm_reservation_payment(v_reserve, p_payment_id);
    end if;
  end if;
end;
$$;

revoke all on function public.finalize_payment(uuid, text, timestamptz, text, jsonb)
  from public, anon, authenticated;

-- =============================================================
-- 운영자 접수 알림 발송 큐 (서버 전용)
--   claim  : 발송할 건을 임대(lease)한다. SKIP LOCKED 라 동시 워커가 같은 건을 보내지 않는다.
--   result : 발송 결과 기록. 실패는 지수 백오프(최대 60분)로 재시도하고 8회에서 멈춘다(운영자 확인 필요).
--   발송 성공 판정은 호출부(lib/email)가 한다. 키 미설정 모의 발송은 성공으로 기록하지 않는다.
-- =============================================================
create or replace function public.claim_intake_notifications(p_limit integer default 10)
returns table (intake_id uuid, reservation_id uuid, reservation_code text, attempts integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select i.id
      from public.reservation_intakes i
      join public.reservations r on r.id = i.reservation_id
     where i.notify_status in ('PENDING', 'FAILED', 'SENDING')
       and i.next_attempt_at <= now()
       and i.attempts < 8
       -- 이미 배정·취소돼 처리가 끝난 건은 보내지 않는다
       and r.status = 'MATCHING'::public.reservation_status
     order by i.next_attempt_at
     limit greatest(1, least(coalesce(p_limit, 10), 50))
     for update of i skip locked
  ), claimed as (
    update public.reservation_intakes i
       set notify_status = 'SENDING',
           attempts = i.attempts + 1,
           last_attempt_at = now(),
           -- 워커가 죽어도 5분 뒤 다시 집어 간다
           next_attempt_at = now() + interval '5 minutes'
      from picked
     where i.id = picked.id
    returning i.id as claimed_id, i.reservation_id as claimed_res, i.attempts as claimed_attempts
  )
  select c.claimed_id, c.claimed_res, r.code, c.claimed_attempts
    from claimed c join public.reservations r on r.id = c.claimed_res;
end $$;
revoke all on function public.claim_intake_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_intake_notifications(integer) to service_role;

create or replace function public.record_intake_notification_result(
  p_intake uuid, p_ok boolean, p_error text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.reservation_intakes where id = p_intake for update;
  if not found then return; end if;
  if p_ok then
    update public.reservation_intakes
       set notify_status = 'SENT', sent_at = coalesce(sent_at, now()), last_error = null
     where id = p_intake and notify_status <> 'SENT';
  else
    update public.reservation_intakes
       set notify_status = 'FAILED',
           last_error = left(coalesce(p_error, 'unknown'), 300),
           next_attempt_at = now() + make_interval(mins => least(power(2, v_attempts)::int, 60))
     where id = p_intake and notify_status <> 'SENT';
  end if;
end $$;
revoke all on function public.record_intake_notification_result(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_intake_notification_result(uuid, boolean, text) to service_role;

-- 운영자 접수 확인 — "이 건을 내가 보았다". 배정 시 자동으로도 찍힌다.
create or replace function public.admin_acknowledge_intake(p_reservation uuid, p_memo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_memo is not null and char_length(v_memo) > 500 then raise exception 'memo_too_long' using errcode = '22023'; end if;
  perform 1 from public.reservation_intakes where reservation_id = p_reservation for update;
  if not found then raise exception 'intake_not_found' using errcode = 'P0002'; end if;
  update public.reservation_intakes
     set acknowledged_at = now(),
         acknowledged_by = auth.uid(),
         acknowledge_memo = v_memo
   where reservation_id = p_reservation and acknowledged_at is null;
  if found then
    perform public.record_reservation_event(p_reservation, 'INTAKE_ACKNOWLEDGED', jsonb_build_object('memo', v_memo));
    perform public.log_access('RESERVATION_INTAKE_ACK', 'reservations', p_reservation, null, '신규 접수 확인');
  end if;
end $$;
revoke all on function public.admin_acknowledge_intake(uuid, text) from public, anon;
grant execute on function public.admin_acknowledge_intake(uuid, text) to authenticated;

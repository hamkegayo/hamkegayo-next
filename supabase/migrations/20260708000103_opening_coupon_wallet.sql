-- #276 사용자 확정: Basic/Plus 공통 25,000원 쿠폰, 예약 확정 선착순 20명.
-- 약관 제11조/제21조: 상품 시간당 요금·최소 예약·선결제/최종정산 유지.
-- 기존 결제 및 HELD/USED 할인액을 수정하지 않는다. 신규 확보에만 25,000원 적용.
comment on column public.payments.campaign_discount_amount is '오픈 이벤트 쿠폰 실제 적용액. 기존 20,000원 거래를 보존하며 신규 확보는 25,000원. 회사 부담, 포인트 중복 불가.';

create or replace function public.reserve_opening_event(p_payment_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype;
  c public.opening_campaign%rowtype; identity public.opening_event_identities%rowtype;
  amount integer; hour_amount integer; existing public.opening_event_claims%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.type<>'BASE' or p.status<>'PENDING' then raise exception 'invalid_payment' using errcode='23514'; end if;
  select * into r from public.reservations where id=p.reservation_id;
  if r.status<>'MATCHING' or r.confirmed_partner_id is null or r.payment_deadline is null or r.payment_deadline<=now() then
    raise exception 'invalid_reservation' using errcode='23514';
  end if;
  select * into c from public.opening_campaign where id for update;
  -- 실패/만료된 임시 확보는 선착순 사용 인원에 포함하지 않는다.
  update public.opening_event_claims set state='RELEASED'
    where state='HELD' and expires_at<=now();
  select * into existing from public.opening_event_claims where payment_id=p.id;
  if found and existing.state='HELD' then return existing.discount_amount; end if;
  if c.used_count>=20 then raise exception 'campaign_full' using errcode='23514'; end if;
  if not c.active or not c.integration_ready then raise exception 'campaign_unavailable' using errcode='23514'; end if;
  if exists (select 1 from public.opening_event_claims where payment_id=p.id) then
    raise exception 'claim_expired' using errcode='23514';
  end if;
  select * into identity from public.opening_event_identities where customer_id=r.customer_id;
  if not found or identity.excluded or identity.verified_at>now() or identity.verification_source<>'SUPABASE_EMAIL'
    or exists(select 1 from public.opening_event_exclusions where customer_id=r.customer_id)
    or not exists(select 1 from auth.users where id=r.customer_id and email_confirmed_at is not null)
    or not exists (select 1 from public.profiles where id=r.customer_id and role='USER' and status='ACTIVE')
    or exists (select 1 from public.services s join public.reservations b on b.id=s.reservation_id
      where b.customer_id=r.customer_id and s.status='COMPLETED')
    or exists (select 1 from public.opening_event_claims where state in ('HELD','USED')
      and (customer_id=r.customer_id or identity_hash=identity.identity_hash)) then
    raise exception 'campaign_ineligible' using errcode='23514';
  end if;
  if c.used_count+(select count(*) from public.opening_event_claims where state='HELD')>=20 then
    raise exception 'campaign_capacity_held' using errcode='23514';
  end if;
  if p.discount_amount<>0 or exists (select 1 from public.points where payment_id=p.id and reason='USE') then
    raise exception 'campaign_not_stackable' using errcode='23514';
  end if;
  amount := 25000;
  hour_amount := case r.plan when 'plus' then 25000 else 20000 end;
  if coalesce(r.duration_minutes,120)<120 or p.gross_amount<=amount
    or p.gross_amount<>round(hour_amount*greatest(coalesce(r.duration_minutes,120),120)/60.0*(1+coalesce(r.surcharge_rate,0))) then
    raise exception 'campaign_invalid_amount' using errcode='23514';
  end if;
  insert into public.opening_event_claims(customer_id,identity_hash,payment_id,reservation_id,discount_amount,expires_at)
    values(r.customer_id,identity.identity_hash,p.id,r.id,amount,greatest(r.payment_deadline,now()+interval '10 minutes'));
  -- 할인은 회사 부담. 정상 지급액을 유지하고 회사 수수료만 줄인다.
  update public.payments set campaign_discount_amount=amount, discount_amount=amount,
    commission_amount=commission_amount-amount where id=p.id;
  return amount;
end $$;
revoke all on function public.reserve_opening_event(uuid) from public, anon, authenticated;
grant execute on function public.reserve_opening_event(uuid) to service_role;

-- 본인 쿠폰함 자동 표시. 조회는 정원을 차지하지 않으며 개인정보 추가 저장 없음.
create or replace function public.opening_event_coupon()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.opening_campaign%rowtype; identity public.opening_event_identities%rowtype;
  claim public.opening_event_claims%rowtype; coupon_state text; held integer;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='USER' and status='ACTIVE') then
    return jsonb_build_object('state','HIDDEN','discount',25000); end if;
  select * into c from public.opening_campaign where id;
  if not found then return jsonb_build_object('state','HIDDEN','discount',25000); end if;
  select * into identity from public.opening_event_identities where customer_id=auth.uid();
  select * into claim from public.opening_event_claims
    where (customer_id=auth.uid() or identity_hash=identity.identity_hash)
      and (state='USED' or (state='HELD' and expires_at>now()))
    order by case state when 'USED' then 0 else 1 end,held_at desc limit 1;
  if found then
    return jsonb_build_object('state',claim.state,'discount',claim.discount_amount,
      'reservationId',case when claim.customer_id=auth.uid() then claim.reservation_id else null end,
      'remaining',greatest(c.capacity-c.used_count,0));
  end if;
  if identity.customer_id is null or identity.excluded or identity.verified_at>now()
    or identity.verification_source<>'SUPABASE_EMAIL'
    or exists(select 1 from public.opening_event_exclusions where customer_id=auth.uid())
    or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
    or exists(select 1 from public.services s join public.reservations r on r.id=s.reservation_id
      where r.customer_id=auth.uid() and s.status='COMPLETED') then
    return jsonb_build_object('state','HIDDEN','discount',25000); end if;
  select count(*) into held from public.opening_event_claims where state='HELD' and expires_at>now();
  coupon_state:=case when c.used_count>=c.capacity then 'EXHAUSTED'
    when c.closed_at is not null then 'CLOSED'
    when not c.active or not c.integration_ready then 'PAUSED'
    when c.used_count+held>=c.capacity then 'WAITING' else 'AVAILABLE' end;
  return jsonb_build_object('state',coupon_state,'discount',25000,
    'remaining',greatest(c.capacity-c.used_count,0));
end $$;
revoke all on function public.opening_event_coupon() from public,anon;
grant execute on function public.opening_event_coupon() to authenticated;

create or replace function public.opening_event_offer(p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.reservations%rowtype; coupon jsonb; applicable boolean;
begin
  select * into r from public.reservations where id=p_reservation_id and customer_id=auth.uid();
  if not found then raise exception 'not_found' using errcode='42501'; end if;
  coupon:=public.opening_event_coupon();
  applicable:=r.status='MATCHING' and (coupon->>'state'='AVAILABLE'
    or (coupon->>'state'='HELD' and coupon->>'reservationId'=r.id::text));
  -- 재시도의 이전 HELD는 prepare에서 해제한 뒤 신규 쿠폰액으로 다시 확보한다.
  return coupon || jsonb_build_object('eligible',coalesce(applicable,false),'discount',25000);
end $$;
revoke all on function public.opening_event_offer(uuid) from public,anon;
grant execute on function public.opening_event_offer(uuid) to authenticated;

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
  v_final      integer;
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
  -- 쿠폰이 최종요금보다 큰 정상 조기 종료: 고객 현금 환불과 파트너 차감을 분리한다.
  -- 예: Basic 40,000-25,000 선결제 후 최종 20,000 → 현금 15,000 환불, 파트너 16,000 유지.
  select r.final_amount into v_final from public.reservations r
    join public.services s on s.reservation_id=r.id
    where r.id=v_req.reservation_id and s.status='COMPLETED' and not s.no_show
      and s.termination_kind not in ('PROVIDER_FAULT','EMERGENCY');
  if v_pay.type='BASE' and v_pay.campaign_discount_amount>0
    and v_final is not null and v_final<v_pay.campaign_discount_amount then
    if v_req.amount<>v_pay.gross_amount-v_pay.discount_amount then
      raise exception 'coupon_refund_amount_mismatch' using errcode='23514'; end if;
    v_payout:=v_pay.payout_amount-(v_final-round(v_final*v_rate)::integer);
    v_commission:=v_req.amount-v_payout;
  end if;


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

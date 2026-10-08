-- #283 리뷰. 쿠폰 확보 시 선결제액 검증을 lib/pricing.ts calcPrepayment 와 같은 순서로 반올림한다.
-- TS: baseAmountFor = round(시간당 단가 × 분 / 60) → withSurcharge = round(기본요금 × (1 + 할증률)).
-- 103 은 한 번만 반올림해 할증률이 0 이 아니면 1원 차이로 campaign_invalid_amount 가 났다.
-- 현재 할증률 0 이라 운영 영향은 없다. 함수 본문은 103 과 같고 금액 검증식만 바뀐다.
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
    where state='HELD' and (expires_at<=now() or not public.opening_event_live_hold(payment_id));
  if c.used_count>=c.capacity then raise exception 'campaign_full' using errcode='23514'; end if;
  if not c.active or not c.integration_ready or c.closed_at is not null then raise exception 'campaign_unavailable' using errcode='23514'; end if;
  select * into existing from public.opening_event_claims where payment_id=p.id;
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
  amount := 25000;
  hour_amount := case r.plan when 'plus' then 25000 else 20000 end;
  if coalesce(r.duration_minutes,120)<120 or p.gross_amount<=amount
    or p.gross_amount<>round(round(hour_amount*greatest(coalesce(r.duration_minutes,120),120)/60.0)*(1+coalesce(r.surcharge_rate,0))) then
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

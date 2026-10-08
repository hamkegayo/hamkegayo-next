-- #276 사용자 확정: Basic/Plus 공통 25,000원 쿠폰, 예약 확정 선착순 20명.
-- 약관 제11조/제21조: 상품 시간당 요금·최소 예약·선결제/최종정산 유지.
-- 기존 결제 및 HELD/USED 할인액을 수정하지 않는다. 신규 확보에만 25,000원 적용.
comment on column public.payments.campaign_discount_amount is '오픈 이벤트 쿠폰 실제 적용액. 기존 20,000원 거래를 보존하며 신규 확보는 25,000원. 회사 부담, 포인트 중복 불가.';

-- 완료 이용·제외 계정은 식별 행을 새로 저장하기 전에도 제외한다.
create or replace function public.opening_event_customer_candidate(p_customer_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_customer_id and p.role='USER' and p.status='ACTIVE' and u.email_confirmed_at is not null)
    and not exists(select 1 from public.opening_event_exclusions where customer_id=p_customer_id)
    and not exists(select 1 from public.services s join public.reservations r on r.id=s.reservation_id
      where r.customer_id=p_customer_id and s.status='COMPLETED');
$$;
revoke all on function public.opening_event_customer_candidate(uuid) from public,anon,authenticated;

-- 조회와 확보에서 같은 적격 기준을 사용한다. 이메일 HMAC 행은 서버만 등록한다.
create or replace function public.opening_event_customer_eligible(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.opening_event_identities i
    where i.customer_id=p_customer_id and not i.excluded and i.verified_at<=now()
      and i.verification_source='SUPABASE_EMAIL')
    and public.opening_event_customer_candidate(p_customer_id);
$$;
revoke all on function public.opening_event_customer_eligible(uuid) from public,anon,authenticated;
grant execute on function public.opening_event_customer_eligible(uuid) to service_role;

-- 이미 같은 인증 이메일이면 서버 helper가 읽기만 한다. 새 식별 행도 적격 대상만 기록한다.
create or replace function public.register_opening_event_email(p_customer_id uuid,p_identity_hash text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.opening_event_customer_candidate(p_customer_id)
    or p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'verified_email_required' using errcode='23514'; end if;
  perform 1 from public.opening_campaign where id for update;
  if not exists(select 1 from public.opening_campaign where id and active and integration_ready and closed_at is null) then
    raise exception 'campaign_unavailable' using errcode='23514'; end if;
  insert into public.opening_event_identities(customer_id,identity_hash,verification_source,verified_at)
    values(p_customer_id,p_identity_hash,'SUPABASE_EMAIL',now())
  on conflict(customer_id) do update set identity_hash=excluded.identity_hash,
    verification_source='SUPABASE_EMAIL',verified_at=now();
end $$;
revoke all on function public.register_opening_event_email(uuid,text) from public,anon,authenticated;
grant execute on function public.register_opening_event_email(uuid,text) to service_role;

create or replace function public.opening_event_live_hold(p_payment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.payments p join public.reservations r on r.id=p.reservation_id
    where p.id=p_payment_id and p.status='PENDING' and r.status='MATCHING'
      and r.confirmed_partner_id is not null and r.payment_deadline>now());
$$;
revoke all on function public.opening_event_live_hold(uuid) from public,anon,authenticated;

-- 취소한 예약의 임시 확보는 즉시 해제한다. USED는 복원하지 않는다.
create or replace function public.release_cancelled_opening_hold()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='CANCELLED' and old.status is distinct from new.status then
    perform 1 from public.opening_campaign where id for update;
    update public.opening_event_claims set state='RELEASED'
      where reservation_id=new.id and state='HELD';
  end if;
  return new;
end $$;
revoke all on function public.release_cancelled_opening_hold() from public,anon,authenticated;
drop trigger if exists release_cancelled_opening_hold on public.reservations;
create trigger release_cancelled_opening_hold after update of status on public.reservations
  for each row execute function public.release_cancelled_opening_hold();

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
      and (state='USED' or (state='HELD' and expires_at>now() and public.opening_event_live_hold(payment_id)))
    order by case state when 'USED' then 0 else 1 end,held_at desc limit 1;
  if claim.state='USED' then
    return jsonb_build_object('state',claim.state,'discount',claim.discount_amount,
      'reservationId',case when claim.customer_id=auth.uid() then claim.reservation_id else null end,
      'remaining',greatest(c.capacity-c.used_count,0));
  end if;
  -- 식별 행 등록이 중지된 회원도 캠페인 중지/종료 안내를 볼 수 있다.
  if c.closed_at is not null then return jsonb_build_object('state','CLOSED','discount',25000); end if;
  if not c.active or not c.integration_ready then return jsonb_build_object('state','PAUSED','discount',25000); end if;
  if not public.opening_event_customer_eligible(auth.uid()) then
    return jsonb_build_object('state','HIDDEN','discount',25000); end if;
  if claim.state='HELD' then
    return jsonb_build_object('state','HELD','discount',claim.discount_amount,
      'reservationId',case when claim.customer_id=auth.uid() then claim.reservation_id else null end,
      'remaining',greatest(c.capacity-c.used_count,0));
  end if;
  select count(*) into held from public.opening_event_claims where state='HELD' and expires_at>now()
    and public.opening_event_live_hold(payment_id);
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
  applicable:=r.status='MATCHING' and r.confirmed_partner_id is not null and r.payment_deadline>now() and (coupon->>'state'='AVAILABLE'
    or (coupon->>'state'='HELD' and coupon->>'reservationId'=r.id::text));
  -- 재시도의 이전 HELD는 prepare에서 해제한 뒤 신규 쿠폰액으로 다시 확보한다.
  return coupon || jsonb_build_object('eligible',coalesce(applicable,false),'discount',25000);
end $$;
revoke all on function public.opening_event_offer(uuid) from public,anon;
grant execute on function public.opening_event_offer(uuid) to authenticated;

-- 최종 서비스 요금에 대응하는 파트너 지급액. 완료·환불 시 반올림 계산을 공유한다.
create or replace function public.opening_event_partner_net(p_gross integer,p_rate numeric)
returns integer language sql immutable set search_path = '' as $$
  select p_gross-round(p_gross*p_rate)::integer;
$$;
revoke all on function public.opening_event_partner_net(integer,numeric) from public,anon,authenticated;

-- 쿠폰 기본 결제는 선결제 원장으로 정산하므로 추가결제 원장은 따로 한 번 반영한다.
-- 서비스 완료 전/후 어느 순서로 추가결제되어도 동일한 결과가 남는다.
create or replace function public.settle_paid_opening_extensions(p_service_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.settlements(service_id,partner_id,amount,fee,net,payment_id,reason)
    select s.id,s.partner_id,p.gross_amount-p.discount_amount,p.commission_amount,p.payout_amount,p.id,'SERVICE_COMPLETED'
      from public.services s join public.payments p on p.reservation_id=s.reservation_id
      where s.id=p_service_id and s.status='COMPLETED' and s.termination_kind not in ('PROVIDER_FAULT','EMERGENCY')
        and p.type='EXTENSION' and p.status='PAID'
        and exists(select 1 from public.payments b where b.reservation_id=s.reservation_id
          and b.type='BASE' and b.status='PAID' and b.campaign_discount_amount>0)
    on conflict(payment_id) where payment_id is not null do nothing;
end $$;
revoke all on function public.settle_paid_opening_extensions(uuid) from public,anon,authenticated;

create or replace function public.settle_opening_extension_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare service_id uuid;
begin
  if new.type='EXTENSION' and new.status='PAID' and old.status is distinct from new.status then
    select id into service_id from public.services where reservation_id=new.reservation_id;
    perform public.settle_paid_opening_extensions(service_id);
  end if;
  return new;
end $$;
revoke all on function public.settle_opening_extension_payment() from public,anon,authenticated;
drop trigger if exists settle_opening_extension_payment on public.payments;
create trigger settle_opening_extension_payment after update of status on public.payments
  for each row execute function public.settle_opening_extension_payment();

-- 마이그레이션 82의 정상·노쇼 원장 및 예외 정산 검증을 유지하고 지급액 계산만 공통화한다.
create or replace function public.create_settlement_on_complete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; p public.payments%rowtype; gross integer;
  discount integer:=0; fee integer; amount integer; rate numeric;
begin
  if new.termination_kind in ('PROVIDER_FAULT','EMERGENCY') then
    if new.status='COMPLETED' and old.status is distinct from new.status
      and not exists(select 1 from public.service_exception_resolutions d join public.settlements st on st.service_id=d.service_id
        where d.service_id=new.id and d.resolved_at is not null and st.reason='SERVICE_EXCEPTION'
          and st.net=d.partner_payout and st.amount=d.final_cash)
      then raise exception 'verified_exception_settlement_required'; end if;
    return new;
  end if;
  if new.status='COMPLETED' and old.status is distinct from new.status then
    select * into r from public.reservations where id=new.reservation_id;
    select * into p from public.payments where reservation_id=new.reservation_id and type='BASE'
      and status='PAID' order by paid_at desc nulls last,id limit 1;
    gross:=coalesce(r.final_amount,r.prepaid_amount,case r.plan when 'plus' then 25000 else 20000 end);
    rate:=coalesce(r.fee_rate,case r.plan when 'plus' then 0.24 else 0.20 end);
    if coalesce(p.campaign_discount_amount,0)>0 and not new.no_show then
      gross:=p.gross_amount; discount:=p.campaign_discount_amount; rate:=p.commission_rate;
    elsif coalesce(p.campaign_discount_amount,0)>0 and new.no_show then
      gross:=p.gross_amount-p.discount_amount; rate:=p.commission_rate;
      update public.payments set commission_amount=gross-public.opening_event_partner_net(gross,rate),
        payout_amount=public.opening_event_partner_net(gross,rate) where id=p.id;
    end if;
    fee:=gross-public.opening_event_partner_net(gross,rate)-discount; amount:=gross-discount;
    insert into public.settlements(service_id,partner_id,amount,fee,net,payment_id,reason)
      values(new.id,new.partner_id,amount,fee,amount-fee,p.id,'SERVICE_COMPLETED') on conflict do nothing;
    perform public.settle_paid_opening_extensions(new.id);
  end if;
  return new;
end $$;

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
    v_payout:=v_pay.payout_amount-public.opening_event_partner_net(v_final,v_rate);
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

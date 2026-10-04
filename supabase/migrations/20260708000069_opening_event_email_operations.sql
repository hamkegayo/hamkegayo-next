-- 사용자 승인: 이메일 계정당 1회, 회사/파트너 사유 전액 환불의 혜택 복원,
-- 행사 종료 및 관련 취소/환불 처리 완료 후 중복 차단 HMAC 파기.
-- 기본 비활성은 유지하며 운영 고지·키 설정·검증 전 활성화하지 않는다.
alter table public.opening_campaign add column if not exists closed_at timestamptz;
alter table public.opening_event_claims add column if not exists restored_at timestamptz;
alter table public.opening_event_claims add column if not exists restored_sequence integer;
alter table public.opening_event_claims add column if not exists restored_confirmed_at timestamptz;
alter table public.opening_event_claims add column if not exists restored_by uuid references public.profiles(id) on delete set null;
alter table public.opening_event_claims add column if not exists restored_reason text;
alter table public.opening_event_claims alter column identity_hash drop not null;

create table if not exists public.opening_event_exclusions (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null, recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);
alter table public.opening_event_exclusions enable row level security;
revoke all on public.opening_event_exclusions from anon,authenticated;
grant all on public.opening_event_exclusions to service_role;
create or replace function public.admin_exclude_opening_event(p_customer_id uuid,p_excluded boolean,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.opening_campaign where id for update;
  if exists(select 1 from public.opening_campaign where id and closed_at is not null) then raise exception 'campaign_closed' using errcode='23514'; end if;
  if p_excluded is null or length(trim(coalesce(p_reason,''))) not between 5 and 500
    or not exists(select 1 from public.profiles where id=p_customer_id and role='USER') then
    raise exception 'invalid_input' using errcode='22023'; end if;
  if p_excluded then
    insert into public.opening_event_exclusions(customer_id,reason,recorded_by)
      values(p_customer_id,trim(p_reason),auth.uid()) on conflict(customer_id)
      do update set reason=excluded.reason,recorded_by=auth.uid(),recorded_at=now();
  else delete from public.opening_event_exclusions where customer_id=p_customer_id; end if;
  update public.opening_event_identities set excluded=p_excluded where customer_id=p_customer_id;
  perform public.log_access('CAMPAIGN_EXCLUSION','opening_event_exclusions',p_customer_id,p_customer_id,trim(p_reason));
end $$;
revoke all on function public.admin_exclude_opening_event(uuid,boolean,text) from public,anon;
grant execute on function public.admin_exclude_opening_event(uuid,boolean,text) to authenticated;

create or replace function public.admin_restore_opening_event(p_claim_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare cl public.opening_event_claims%rowtype; pay public.payments%rowtype; refunded integer;
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'invalid_reason' using errcode='22023'; end if;
  perform 1 from public.opening_campaign where id for update;
  if exists(select 1 from public.opening_campaign where id and closed_at is not null) then raise exception 'campaign_closed' using errcode='23514'; end if;
  select * into cl from public.opening_event_claims where id=p_claim_id for update;
  if not found or cl.state<>'USED' then raise exception 'claim_not_restorable' using errcode='23514'; end if;
  if not exists(select 1 from public.reservations where id=cl.reservation_id and status='CANCELLED') then raise exception 'cancellation_required' using errcode='23514'; end if;
  select * into pay from public.payments where id=cl.payment_id;
  if not found or pay.status<>'PAID' or pay.type<>'BASE' then raise exception 'paid_base_required' using errcode='23514'; end if;
  select coalesce(-sum(gross_amount-discount_amount),0) into refunded from public.payments
    where reservation_id=cl.reservation_id and type='REFUND' and status='PAID';
  if refunded < pay.gross_amount-pay.discount_amount then raise exception 'full_cash_refund_required' using errcode='23514'; end if;
  -- 회사/파트너 귀책은 담당자가 증빙 대조 후 사유로 확인한다. 고객 취소 자동 복원 없음.
  update public.opening_event_claims set state='RELEASED',restored_at=now(),
    restored_sequence=sequence,restored_confirmed_at=confirmed_at,restored_by=auth.uid(),
    restored_reason=trim(p_reason),sequence=null,confirmed_at=null where id=cl.id;
  update public.opening_campaign set used_count=used_count-1,updated_at=now() where id;
  perform public.log_access('CAMPAIGN_PROVIDER_FAULT_RESTORE','opening_event_claims',cl.id,cl.customer_id,trim(p_reason));
end $$;
revoke all on function public.admin_restore_opening_event(uuid,text) from public,anon;
grant execute on function public.admin_restore_opening_event(uuid,text) to authenticated;

create or replace function public.admin_close_opening_event(p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'invalid_reason' using errcode='22023'; end if;
  perform 1 from public.opening_campaign where id for update;
  if exists(select 1 from public.opening_event_claims where state='HELD' and expires_at>now()) then raise exception 'live_claims_pending' using errcode='23514'; end if;
  update public.opening_event_claims set state='RELEASED' where state='HELD';
  update public.opening_campaign set active=false,integration_ready=false,closed_at=coalesce(closed_at,now()),updated_at=now() where id;
  perform public.log_access('CAMPAIGN_CLOSE','opening_campaign',null,null,trim(p_reason));
end $$;
revoke all on function public.admin_close_opening_event(text) from public,anon;
grant execute on function public.admin_close_opening_event(text) to authenticated;

create or replace function public.purge_closed_opening_event_identities()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  perform 1 from public.opening_campaign where id for update;
  if not exists(select 1 from public.opening_campaign where id and closed_at is not null)
    or exists(select 1 from public.opening_event_claims cl join public.reservations r on r.id=cl.reservation_id
      where r.status not in ('COMPLETED','CANCELLED'))
    or exists(select 1 from public.refund_requests rr join public.opening_event_claims cl on cl.reservation_id=rr.reservation_id
      where rr.status in ('PENDING','APPROVED'))
    or exists(select 1 from public.payments p join public.opening_event_claims cl on cl.reservation_id=p.reservation_id
      where p.status='PENDING')
    or exists(select 1 from public.payment_incidents pi join public.opening_event_claims cl on cl.payment_id=pi.payment_id
      where pi.status::text<>'RESOLVED') then return 0; end if;
  delete from public.opening_event_identities;
  get diagnostics affected=row_count;
  delete from public.opening_event_exclusions;
  update public.opening_event_claims set identity_hash=null where identity_hash is not null;
  return affected;
end $$;
revoke all on function public.purge_closed_opening_event_identities() from public,anon,authenticated;
grant execute on function public.purge_closed_opening_event_identities() to service_role;
-- 매일 행사 종료·환불 처리 완료 조건을 검사해 HMAC만 파기한다. 거래 기록은 유지한다.
select cron.schedule('opening-event-identity-purge','10 18 * * *',
  'select public.purge_closed_opening_event_identities();');

-- 이벤트는 선결제 기준 1차 원장과 부분환불/추가결제 원장을 합산하여 이중 계상을 막는다.
-- 결제 없는 승인은 기존 settlement_payment_ready가 계속 거절한다.
create or replace function public.create_settlement_on_complete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; p public.payments%rowtype; gross integer;
  discount integer:=0; fee integer; amount integer; rate numeric;
begin
  if new.status='COMPLETED' and old.status is distinct from new.status then
    select * into r from public.reservations where id=new.reservation_id;
    select * into p from public.payments where reservation_id=new.reservation_id and type='BASE'
      and status='PAID' order by paid_at desc nulls last,id limit 1;
    gross:=coalesce(r.final_amount,r.prepaid_amount,case r.plan when 'plus' then 25000 else 20000 end);
    rate:=coalesce(r.fee_rate,case r.plan when 'plus' then 0.24 else 0.20 end);
    if coalesce(p.campaign_discount_amount,0)>0 and not new.no_show then
      gross:=p.gross_amount; discount:=p.campaign_discount_amount; rate:=p.commission_rate;
    elsif coalesce(p.campaign_discount_amount,0)>0 and new.no_show then
      rate:=p.commission_rate;
      -- 노쇼는 할인 없는 1시간 정산. 선결제 원장의 지급액도 같은 결과로 맞춘다.
      update public.payments set commission_amount=round(gross*rate),
        payout_amount=gross-round(gross*rate) where id=p.id;
    end if;
    fee:=round(gross*rate)-discount; amount:=gross-discount;
    insert into public.settlements(service_id,partner_id,amount,fee,net,payment_id,reason)
      values(new.id,new.partner_id,amount,fee,amount-fee,p.id,'SERVICE_COMPLETED') on conflict do nothing;
  end if;
  return new;
end $$;

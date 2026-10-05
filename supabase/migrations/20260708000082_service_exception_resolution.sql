-- #185 / 사용자 확정: 약관 제11조④·제16조⑦·제18조③.
-- 실제 제공 내용은 운영자가 판정한다. PG 콘솔 환불 후 서버 조회로 잔액을
-- 검증하고 현금 원장과 최종 파트너 지급액을 한 번만 반영한다.
create table public.service_exception_resolutions (
 service_id uuid primary key references public.services(id) on delete cascade,
 decision text not null check(decision in ('UNAVAILABLE','PARTIAL','EMERGENCY')),
 cash_before integer not null check(cash_before>=0),
 final_cash integer not null check(final_cash>=0),
 partner_payout integer not null check(partner_payout>=0),
 reason text not null check(length(reason) between 5 and 500),
 evidence_reference text not null check(length(evidence_reference) between 5 and 500),
 restore_benefit boolean not null default false,
 decided_by uuid references public.profiles(id) on delete set null,
 decided_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolved_by uuid references public.profiles(id) on delete set null,
 check(decision<>'UNAVAILABLE' or final_cash=0),
 check(not restore_benefit or decision='UNAVAILABLE')
);
create table public.service_exception_transactions (
 service_id uuid not null references public.service_exception_resolutions(service_id) on delete cascade,
 payment_id uuid primary key references public.payments(id) on delete cascade,
 cash integer not null check(cash>=0),
 target_balance integer not null check(target_balance>=0 and target_balance<=cash),
 commission_before integer not null default 0,
 payout_before integer not null default 0,
 additional boolean not null default false
);
alter table public.service_exception_resolutions enable row level security;
alter table public.service_exception_transactions enable row level security;
revoke all on public.service_exception_resolutions,public.service_exception_transactions from public,anon,authenticated;
grant all on public.service_exception_resolutions,public.service_exception_transactions to service_role;

-- 고정된 운영 판정 건의 추가결제와 검증된 환불만 예외 보류를 통과한다.
create or replace function public.guard_service_exception_money() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.type in ('EXTENSION','REFUND') and exists(select 1 from public.services s
   where s.reservation_id=new.reservation_id and s.termination_kind in ('PROVIDER_FAULT','EMERGENCY'))
   and not exists(select 1 from public.service_exception_transactions t
    join public.service_exception_resolutions d using(service_id)
    join public.services s on s.id=d.service_id
    where s.reservation_id=new.reservation_id and (
     (t.additional and t.payment_id=new.id and new.type='EXTENSION'
      and new.gross_amount=t.cash and new.discount_amount=0)
     or (new.type='REFUND' and d.resolved_at is not null
      and new.order_id='EX-'||t.payment_id::text and new.gross_amount=t.target_balance-t.cash
      and new.discount_amount=0 and new.payout_amount=0)))
 then raise exception 'exception_review_pending'; end if;
 return new;
end $$;
create or replace function public.guard_service_exception_complete() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.status='COMPLETED' and new.termination_kind in ('PROVIDER_FAULT','EMERGENCY')
  and not exists(select 1 from public.service_exception_resolutions where service_id=new.id and resolved_at is not null)
 then raise exception 'exception_review_pending'; end if;
 return new;
end $$;
create or replace function public.guard_service_exception_settlement() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.status='APPROVED' and exists(select 1 from public.services s where s.id=new.service_id
  and s.termination_kind in ('PROVIDER_FAULT','EMERGENCY'))
  and not exists(select 1 from public.service_exception_resolutions where service_id=new.service_id and resolved_at is not null)
 then raise exception 'exception_review_pending'; end if;
 return new;
end $$;

create function public.admin_plan_service_exception(p_service uuid,p_decision text,
 p_final_cash integer,p_partner_payout integer,p_reason text,p_evidence text,p_restore boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare s public.services; p public.payments; cash integer; remaining integer;
 take integer; extra uuid:=gen_random_uuid(); token text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 select * into s from public.services where id=p_service for update;
 if s.id is null or s.status<>'ENDED' or s.no_show or s.termination_kind not in ('PROVIDER_FAULT','EMERGENCY')
  then raise exception 'not_reviewable' using errcode='23514'; end if;
 if p_decision is null or p_decision not in ('UNAVAILABLE','PARTIAL','EMERGENCY')
  or (s.termination_kind='EMERGENCY' and p_decision<>'EMERGENCY')
  or (s.termination_kind='PROVIDER_FAULT' and p_decision='EMERGENCY')
  or (s.started_at is null and p_decision<>'UNAVAILABLE')
  or p_final_cash is null or p_final_cash not between 0 and 10000000
  or p_partner_payout is null or p_partner_payout not between 0 and 10000000
  or (p_decision='UNAVAILABLE' and p_final_cash<>0)
  or length(trim(coalesce(p_reason,''))) not between 5 and 500
  or length(trim(coalesce(p_evidence,''))) not between 5 and 500
  or p_restore is null or (p_restore and p_decision<>'UNAVAILABLE')
  then raise exception 'invalid_decision' using errcode='22023'; end if;
 if p_restore then perform 1 from public.opening_campaign where id for update; end if;
 perform 1 from public.reservations where id=s.reservation_id for update;
 perform 1 from public.payments where reservation_id=s.reservation_id order by id for update;
 if exists(select 1 from public.service_exception_resolutions where service_id=s.id)
  or exists(select 1 from public.settlements where service_id=s.id)
  or exists(select 1 from public.refund_requests where reservation_id=s.reservation_id)
  or exists(select 1 from public.payments where reservation_id=s.reservation_id and
    (status='PENDING' or (type='REFUND' and status='PAID')))
  or (select count(*) from public.payments where reservation_id=s.reservation_id and type='BASE' and status='PAID')<>1
  or (select count(*) from public.payments where reservation_id=s.reservation_id and status='PAID')>20
  then raise exception 'existing_financial_processing_requires_reconciliation' using errcode='23514'; end if;
 select coalesce(sum(gross_amount-discount_amount),0)::integer into cash from public.payments
  where reservation_id=s.reservation_id and status='PAID';
 if cash<0 then raise exception 'invalid_cash'; end if;
 if p_restore and (not exists(select 1 from public.opening_event_claims cl join public.payments pay on pay.id=cl.payment_id
    where cl.reservation_id=s.reservation_id and cl.state='USED' and pay.type='BASE' and pay.status='PAID')
   or exists(select 1 from public.opening_campaign where id and closed_at is not null))
  then raise exception 'benefit_not_restorable'; end if;
 if p_decision='UNAVAILABLE' and not p_restore and exists(select 1 from public.opening_event_claims
   where reservation_id=s.reservation_id and state='USED') then raise exception 'benefit_restoration_required'; end if;
 insert into public.service_exception_resolutions(service_id,decision,cash_before,final_cash,partner_payout,reason,evidence_reference,restore_benefit,decided_by)
 values(s.id,p_decision,cash,p_final_cash,p_partner_payout,trim(p_reason),trim(p_evidence),p_restore,auth.uid());
 remaining:=greatest(cash-p_final_cash,0);
 for p in select * from public.payments where reservation_id=s.reservation_id and status='PAID'
   order by paid_at desc nulls last,id loop
  take:=least(remaining,p.gross_amount-p.discount_amount);
  insert into public.service_exception_transactions(service_id,payment_id,cash,target_balance,commission_before,payout_before)
   values(s.id,p.id,p.gross_amount-p.discount_amount,p.gross_amount-p.discount_amount-take,p.commission_amount,p.payout_amount);
  remaining:=remaining-take;
 end loop;
 if p_final_cash>cash then
  insert into public.service_exception_transactions(service_id,payment_id,cash,target_balance,additional)
   values(s.id,extra,p_final_cash-cash,p_final_cash-cash,true);
  -- 신규 결제를 같은 트랜잭션에서 등록하므로 FK 검사를 지연한다.
  insert into public.payments(id,reservation_id,type,status,order_id,gross_amount,commission_amount,payout_amount,
    pay_token,token_expires_at,charge_reason,review_required)
   values(extra,s.reservation_id,'EXTENSION','PENDING','EX-'||extra::text,p_final_cash-cash,p_final_cash-cash,0,
     token,now()+interval '3 days','EXTENSION',false);
  insert into public.notifications(recipient_id,type,title,body,link,dedupe_key)
   select customer_id,'PAYMENT_ADDITIONAL','운영 확인 후 추가 결제 안내',
    '서비스 종료 내용을 확인한 추가 결제입니다. 금액을 확인해 주세요.','/pay/'||token,'exception-charge:'||s.id::text
    from public.reservations where id=s.reservation_id;
 end if;
 perform public.log_access('SERVICE_EXCEPTION_DECISION','services',s.id,s.partner_id,trim(p_reason)||' / 증빙: '||trim(p_evidence));
end $$;
-- 신규 결제의 지정 id를 먼저 등록해야 금융 보류 트리거가 발급을 허용한다.
alter table public.service_exception_transactions drop constraint service_exception_transactions_payment_id_fkey;
alter table public.service_exception_transactions add foreign key(payment_id) references public.payments(id) on delete cascade deferrable initially deferred;
revoke all on function public.admin_plan_service_exception(uuid,text,integer,integer,text,text,boolean) from public,anon;
grant execute on function public.admin_plan_service_exception(uuid,text,integer,integer,text,text,boolean) to authenticated;

create function public.admin_get_service_exception(p_service uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.services; r public.reservations;
begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'invalid_reason'; end if;
 select * into s from public.services where id=p_service;
 if s.id is null or s.termination_kind not in ('PROVIDER_FAULT','EMERGENCY') then raise exception 'not_exception'; end if;
 select * into r from public.reservations where id=s.reservation_id;
 perform public.log_access('SERVICE_EXCEPTION_DETAIL','services',s.id,s.partner_id,trim(p_reason));
 return jsonb_build_object('serviceId',s.id,'code',r.code,'kind',s.termination_kind,
  'startedAt',s.started_at,'endedAt',s.ended_at,'actorId',auth.uid(),
  'decision',(select to_jsonb(d) from public.service_exception_resolutions d where service_id=s.id),
  'cashPaid',(select coalesce(sum(gross_amount-discount_amount),0) from public.payments where reservation_id=r.id and status='PAID'),
  'eventUsed',exists(select 1 from public.opening_event_claims where reservation_id=r.id and state='USED'),
  'transactions',(select coalesce(jsonb_agg(jsonb_build_object('paymentId',p.id,'orderId',p.order_id,
    'transactionId',p.transaction_id,'cash',t.cash,'targetBalance',t.target_balance,'status',p.status,
    'refund',t.cash-t.target_balance,'additional',t.additional)), '[]'::jsonb)
    from public.service_exception_transactions t join public.payments p on p.id=t.payment_id where t.service_id=s.id));
end $$;
revoke all on function public.admin_get_service_exception(uuid,text) from public,anon;
grant execute on function public.admin_get_service_exception(uuid,text) to authenticated;

create function public.exception_extension_allowed(p_payment uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.service_exception_transactions t join public.service_exception_resolutions d using(service_id)
  join public.payments p on p.id=t.payment_id where p.id=p_payment and t.additional
  and p.gross_amount=t.cash and p.discount_amount=0
  and (p.status='PAID' or (p.status='PENDING' and d.resolved_at is null and p.token_expires_at>now())));
$$;
revoke all on function public.exception_extension_allowed(uuid) from public,anon,authenticated;
grant execute on function public.exception_extension_allowed(uuid) to service_role;

-- 호출자는 PG 조회 결과만 전달하는 서버. 고객 브라우저의 완료 주장으로 해제하지 않는다.
create function public.record_service_exception_resolution(p_service uuid,p_actor uuid,p_verified jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s public.services; d public.service_exception_resolutions; tx record; v jsonb;
 base_id uuid; refunded integer; net_cash integer; customer uuid;
begin
 if not exists(select 1 from public.profiles p join public.admin_accounts a on a.profile_id=p.id
   join auth.users u on u.id=p.id
   where p.id=p_actor and p.role='ADMIN' and p.status='ACTIVE' and a.duty in ('전체','정산')
    and coalesce((u.raw_app_meta_data->>'must_change_password')::boolean,false)=false)
  then raise exception 'forbidden' using errcode='42501'; end if;
 select * into s from public.services where id=p_service for update;
 select * into d from public.service_exception_resolutions where service_id=p_service for update;
 if d.service_id is null then raise exception 'decision_required'; end if;
 if d.resolved_at is not null then return; end if;
 if s.status<>'ENDED' or s.no_show then raise exception 'invalid_service_state'; end if;
 perform 1 from public.reservations where id=s.reservation_id for update;
 perform 1 from public.payments where reservation_id=s.reservation_id order by id for update;
 if jsonb_typeof(p_verified) is distinct from 'array'
  or jsonb_array_length(p_verified)<>(select count(*) from public.service_exception_transactions where service_id=s.id)
  or exists(select 1 from public.payments p where p.reservation_id=s.reservation_id and p.status='PAID'
    and not exists(select 1 from public.service_exception_transactions t where t.payment_id=p.id and t.service_id=s.id))
  or exists(select 1 from public.payments where reservation_id=s.reservation_id and status='PENDING')
  or exists(select 1 from public.refund_requests where reservation_id=s.reservation_id)
  or exists(select 1 from public.settlements where service_id=s.id)
  then raise exception 'financial_state_changed'; end if;
 for tx in select x.*,p.order_id,p.transaction_id,p.gross_amount,p.discount_amount,p.status,p.type
  from public.service_exception_transactions x join public.payments p on p.id=x.payment_id where x.service_id=s.id loop
  select value into v from jsonb_array_elements(p_verified) where value->>'paymentId'=tx.payment_id::text;
  if v is null or tx.status<>'PAID' or tx.gross_amount-tx.discount_amount<>tx.cash
   or v->>'orderId' is distinct from tx.order_id
   or v->>'transactionId' is distinct from tx.transaction_id
   or (v->>'cash')::integer is distinct from tx.cash
   or (v->>'balance')::integer is distinct from tx.target_balance
   then raise exception 'pg_verification_mismatch'; end if;
 end loop;
 -- 보류 해제·환불 원장·최종 정산·완료·알림을 하나의 트랜잭션에서 처리한다.
 update public.service_exception_resolutions set resolved_at=now(),resolved_by=p_actor where service_id=s.id;
 for tx in select x.*,p.reservation_id from public.service_exception_transactions x join public.payments p on p.id=x.payment_id where x.service_id=s.id loop
  refunded:=tx.cash-tx.target_balance;
  if refunded>0 then
   insert into public.payments(reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,paid_at)
    values(s.reservation_id,'REFUND','PAID','EX-'||tx.payment_id::text,-refunded,0,-refunded,0,now());
  end if;
 end loop;
 select payment_id into base_id from public.service_exception_transactions t join public.payments p on p.id=t.payment_id
  where t.service_id=s.id and p.type='BASE';
 -- 승인 총액·할인은 보존한다. 분배만 확정하고 환불로 지급액을 이중 차감하지 않는다.
 update public.payments set payout_amount=case when id=base_id then d.partner_payout else 0 end,
   commission_amount=gross_amount-discount_amount-case when id=base_id then d.partner_payout else 0 end
  where reservation_id=s.reservation_id and status='PAID' and type<>'REFUND';
 select sum(gross_amount-discount_amount)::integer into net_cash from public.payments where reservation_id=s.reservation_id and status='PAID';
 if net_cash<>d.final_cash or (select sum(payout_amount) from public.payments where reservation_id=s.reservation_id and status='PAID')<>d.partner_payout then raise exception 'ledger_mismatch'; end if;
 insert into public.settlements(service_id,partner_id,amount,fee,net,payment_id,reason)
  values(s.id,s.partner_id,net_cash,net_cash-d.partner_payout,d.partner_payout,base_id,'SERVICE_EXCEPTION');
 update public.reservations set final_amount=d.final_cash,status=case when d.decision='UNAVAILABLE' then 'CANCELLED'::public.reservation_status else 'COMPLETED'::public.reservation_status end
  where id=s.reservation_id returning customer_id into customer;
 if d.decision='UNAVAILABLE' then perform public.release_points(base_id); end if;
 if d.restore_benefit then
  perform 1 from public.opening_campaign where id for update;
  if exists(select 1 from public.opening_campaign where id and closed_at is not null) then raise exception 'campaign_closed_restore_unavailable'; end if;
  update public.opening_event_claims set state='RELEASED',restored_at=now(),restored_by=p_actor,
   restored_reason=d.reason||' / 증빙: '||d.evidence_reference,restored_sequence=sequence,restored_confirmed_at=confirmed_at,sequence=null,confirmed_at=null
   where reservation_id=s.reservation_id and state='USED';
  if found then update public.opening_campaign set used_count=used_count-1,updated_at=now() where id; end if;
 end if;
 update public.services set status='COMPLETED' where id=s.id;
 insert into public.notifications(recipient_id,type,title,body,link,dedupe_key)
  values(customer,'SERVICE_EXCEPTION_RESOLVED','서비스 종료 확인이 완료되었어요',
   '최종 현금 청구액 '||d.final_cash||'원, 현금 환불액 '||greatest(d.cash_before-d.final_cash,0)||'원으로 확인되었습니다.',
   '/mypage/reservations/'||s.reservation_id::text,'exception-resolved:'||s.id::text);
 -- 서버 JWT에는 auth.uid()가 없으므로 실제 검증 담당자를 명시해 기록한다.
 insert into public.access_logs(actor_id,actor_role,subject_id,action,target_table,target_id,reason)
 values(p_actor,'ADMIN',s.partner_id,'SERVICE_EXCEPTION_RESOLVE','services',s.id,
  d.reason||' / 증빙: '||d.evidence_reference||' / 현금: '||d.final_cash||' / 지급: '||d.partner_payout);
end $$;
revoke all on function public.record_service_exception_resolution(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_service_exception_resolution(uuid,uuid,jsonb) to service_role;

-- 예약자에게는 본인 건의 현금 처리 상태만 반환한다. 증빙·파트너 지급액은 제외한다.
create function public.get_own_service_exception_summary(p_reservation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.services; d public.service_exception_resolutions;
begin
 if not exists(select 1 from public.reservations where id=p_reservation and customer_id=auth.uid())
  then raise exception 'forbidden' using errcode='42501'; end if;
 select * into s from public.services where reservation_id=p_reservation;
 if s.termination_kind not in ('PROVIDER_FAULT','EMERGENCY') or s.id is null then return null; end if;
 select * into d from public.service_exception_resolutions where service_id=s.id;
 return jsonb_build_object('pending',d.resolved_at is null,'finalCash',d.final_cash,
  'cashBefore',d.cash_before,'refund',greatest(d.cash_before-d.final_cash,0),
  'additional',greatest(d.final_cash-d.cash_before,0),'restored',d.restore_benefit and d.resolved_at is not null);
end $$;
revoke all on function public.get_own_service_exception_summary(uuid) from public,anon;
grant execute on function public.get_own_service_exception_summary(uuid) to authenticated;

-- 서비스 시작 전 제공 불가도 실제 시작시각을 조작하지 않고 운영 확인으로 보낸다.
create function public.admin_mark_service_unavailable(p_code text,p_reason text,p_evidence text)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.services; r public.reservations;
begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 500 or length(trim(coalesce(p_evidence,''))) not between 5 and 500 then raise exception 'invalid_reason'; end if;
 select * into r from public.reservations where code=trim(p_code) for update;
 select * into s from public.services where reservation_id=r.id for update;
 if r.id is null or r.status<>'CONFIRMED' or s.id is null or s.status<>'SCHEDULED' or s.started_at is not null
  or s.no_show or not exists(select 1 from public.payments where reservation_id=r.id and type='BASE' and status='PAID')
  then raise exception 'not_scheduled_paid_service'; end if;
 update public.services set termination_kind='PROVIDER_FAULT',status='ENDED',ended_at=now() where id=s.id;
 perform public.log_access('SERVICE_UNAVAILABLE','services',s.id,s.partner_id,trim(p_reason)||' / 증빙: '||trim(p_evidence));
 insert into public.notifications(recipient_id,type,title,body,link)
 values(r.customer_id,'SERVICE_EXCEPTION_REVIEW','서비스 제공 내용을 확인하고 있어요',
  '운영 담당자가 제공 불가 사유와 결제 내용을 확인한 뒤 환불을 안내해 드립니다.','/mypage/reservations/'||r.id::text);
 return s.id;
end $$;
revoke all on function public.admin_mark_service_unavailable(text,text,text) from public,anon;
grant execute on function public.admin_mark_service_unavailable(text,text,text) to authenticated;

-- 복원을 기다리는 예외 건을 둔 채 행사를 종료하면 처리 경로가 막힌다.
alter function public.admin_close_opening_event(text) rename to admin_close_opening_event_without_exceptions;
revoke all on function public.admin_close_opening_event_without_exceptions(text) from public,anon,authenticated;
create function public.admin_close_opening_event(p_reason text)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.opening_campaign where id for update;
 if exists(select 1 from public.services s join public.opening_event_claims cl on cl.reservation_id=s.reservation_id
  where s.termination_kind in ('PROVIDER_FAULT','EMERGENCY') and s.status<>'COMPLETED' and cl.state='USED')
  then raise exception 'exception_processing_pending'; end if;
 perform public.admin_close_opening_event_without_exceptions(p_reason);
end $$;
revoke all on function public.admin_close_opening_event(text) from public,anon;
grant execute on function public.admin_close_opening_event(text) to authenticated;

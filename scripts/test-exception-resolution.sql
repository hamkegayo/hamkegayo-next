begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(sql text) returns void language plpgsql as $$ begin begin execute sql; exception when others then return; end; raise exception 'expected denied: %',sql; end $$;
insert into auth.users(id,email) values('00000082-0000-4000-8000-000000000999','resolution-partner@example.invalid'),('00000082-0000-4000-8000-000000000998','resolution-admin@example.invalid');
insert into public.profiles(id,name,role) values('00000082-0000-4000-8000-000000000999','Resolution Partner','PARTNER'),('00000082-0000-4000-8000-000000000998','Resolution Admin','ADMIN');
insert into public.partner_accounts(profile_id,login_id) values('00000082-0000-4000-8000-000000000999','resolution-partner');
insert into public.admin_accounts(profile_id,duty) values('00000082-0000-4000-8000-000000000998','정산');
update public.opening_campaign set active=false,integration_ready=false,closed_at=null,used_count=1 where id;
do $$ declare i integer; uid uuid; rid uuid; pid uuid; sid uuid; gross integer; discount integer; campaign integer;
begin
 for i in 1..5 loop
  uid:=('00000082-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  rid:=('00000082-0001-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  pid:=('00000082-0002-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  sid:=('00000082-0003-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  gross:=case i when 1 then 80000 when 2 then 104000 when 3 then 130000 else 40000 end;
  campaign:=case i when 1 then 20000 when 2 then 20000 when 3 then 25000 else 0 end;
  discount:=case when i=5 then 40000 else campaign end;
  insert into auth.users(id,email) values(uid,'resolution-'||i||'@example.invalid');
  insert into public.profiles(id,name,role) values(uid,'Resolution Owner','USER');
  insert into public.reservations(id,code,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address,prepaid_amount,surcharge_rate)
   values(rid,'TEST-RESOLUTION-'||i,uid,case when i=3 then 'plus' else 'basic' end,'Test','1960-01-01','female','01000000000','Test','01000000000','self','Test','Test','2099-01-01','09:00','09:00','4시간',240,'Test','Test',gross,case when i in (2,3) then 0.3 else 0 end);
  insert into public.services(id,reservation_id,partner_id,status,started_at,ended_at,termination_kind)
   values(sid,rid,'00000082-0000-4000-8000-000000000999',case when i=1 then 'SCHEDULED'::public.service_status else 'ENDED'::public.service_status end,
    case when i=1 then null else now()-interval '4 hours' end,case when i=1 then null else now() end,case when i=1 then 'NORMAL' when i=3 then 'EMERGENCY' else 'PROVIDER_FAULT' end);
  insert into public.payments(id,reservation_id,type,status,order_id,transaction_id,gross_amount,discount_amount,campaign_discount_amount,commission_amount,payout_amount,paid_at)
   values(pid,rid,'BASE','PAID','TEST-RESOLUTION-'||i,case when i=5 then null else 'TEST-RESOLUTION-TID-'||i end,gross,discount,campaign,0,gross-discount,now());
  if i=1 then
   insert into public.opening_event_claims(customer_id,identity_hash,payment_id,reservation_id,discount_amount,state,sequence,confirmed_at,expires_at)
    values(uid,repeat('a',64),pid,rid,20000,'USED',1,now(),now()+interval '1 hour');
  end if;
  if i=5 then
   insert into public.points(user_id,amount,reason,reservation_id,payment_id) values(uid,-40000,'USE',rid,pid);
  end if;
 end loop;
end $$;
update public.reservations set status='CONFIRMED',confirmed_partner_id='00000082-0000-4000-8000-000000000999' where code like 'TEST-RESOLUTION-%';
-- 고객 및 MFA 없는 관리자에게 판정·서버 기록·민감 자료를 열지 않는다.
select set_config('request.jwt.claims','{"sub":"00000082-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_get_service_exception('00000082-0003-4000-8000-000000000002','Test access')$q$);
select pg_temp.denied($q$select public.record_service_exception_resolution('00000082-0003-4000-8000-000000000002','00000082-0000-4000-8000-000000000998','[]')$q$);
select pg_temp.denied($q$select public.get_own_service_exception_summary('00000082-0001-4000-8000-000000000002')$q$);
select pg_temp.denied($q$select * from public.service_exception_resolutions$q$);
reset role;
select set_config('request.jwt.claims','{"sub":"00000082-0000-4000-8000-000000000998","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000002','PARTIAL',26000,20800,'Test decision','Test evidence')$q$);
reset role;
select set_config('request.jwt.claims','{"sub":"00000082-0000-4000-8000-000000000998","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select public.admin_mark_service_unavailable('TEST-RESOLUTION-1','Provider unavailable','PRIVATE-EVIDENCE-1');
select pg_temp.denied($q$select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000001','UNAVAILABLE',1,0,'Provider unavailable','PRIVATE-EVIDENCE-1',true)$q$);
select pg_temp.denied($q$select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000002','PARTIAL',26000,20800,'Test decision','')$q$);
select pg_temp.denied($q$select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000003','UNAVAILABLE',0,0,'Test decision','Test evidence',true)$q$);
select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000001','UNAVAILABLE',0,0,'Provider unavailable','PRIVATE-EVIDENCE-1',true);
select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000002','PARTIAL',26000,20800,'Actual partial service','PRIVATE-EVIDENCE-2');
select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000003','EMERGENCY',32500,24700,'Actual emergency service','PRIVATE-EVIDENCE-3');
select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000004','PARTIAL',60000,48000,'Actual service extension','PRIVATE-EVIDENCE-4');
select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000005','UNAVAILABLE',0,0,'Provider unavailable','PRIVATE-EVIDENCE-5');
select pg_temp.denied($q$select public.admin_plan_service_exception('00000082-0003-4000-8000-000000000002','PARTIAL',0,0,'Changed decision','Test evidence')$q$);
reset role;
select pg_temp.assert(not exists(select 1 from public.settlements st join public.services s on s.id=st.service_id where s.reservation_id in (select id from public.reservations where code like 'TEST-RESOLUTION-%')),'no settlement before PG verification');
select pg_temp.assert(not exists(select 1 from public.payments where order_id like 'EX-%' and type='REFUND'),'no assumed cash refund');
select pg_temp.assert((select state='USED' from public.opening_event_claims where payment_id='00000082-0002-4000-8000-000000000001'),'benefit held until verified refund');
select pg_temp.denied($q$select public.record_service_exception_resolution('00000082-0003-4000-8000-000000000001','00000082-0000-4000-8000-000000000998','[{"paymentId":"00000082-0002-4000-8000-000000000001","orderId":"TEST-RESOLUTION-1","transactionId":"TEST-RESOLUTION-TID-1","cash":60000,"balance":1}]')$q$);
-- 알림 실패도 원장·정산·해제를 모두 롤백한다.
create function pg_temp.fail_resolution_notice() returns trigger language plpgsql as $$ begin if new.dedupe_key='exception-resolved:00000082-0003-4000-8000-000000000001' then raise exception 'simulated notification failure'; end if; return new; end $$;
create trigger test_resolution_notice before insert on public.notifications for each row execute function pg_temp.fail_resolution_notice();
select pg_temp.denied($q$select public.record_service_exception_resolution('00000082-0003-4000-8000-000000000001','00000082-0000-4000-8000-000000000998','[{"paymentId":"00000082-0002-4000-8000-000000000001","orderId":"TEST-RESOLUTION-1","transactionId":"TEST-RESOLUTION-TID-1","cash":60000,"balance":0}]')$q$);
select pg_temp.assert((select resolved_at is null from public.service_exception_resolutions where service_id='00000082-0003-4000-8000-000000000001'),'notification failure retains hold');
select pg_temp.assert(not exists(select 1 from public.payments where order_id='EX-00000082-0002-4000-8000-000000000001'),'notification failure rolls back refund');
drop trigger test_resolution_notice on public.notifications;
-- 실제 PG 호출 없이 서버 검증 결과를 모사한다.
do $$ declare i integer; sid uuid; rid uuid; verified jsonb;
begin
 for i in 1..5 loop
  sid:=('00000082-0003-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  rid:=('00000082-0001-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  if i=4 then
   perform pg_temp.assert(exists(select 1 from public.service_exception_transactions t join public.payments p on p.id=t.payment_id where t.service_id=sid and t.additional and public.exception_extension_allowed(p.id)),'only specified extra payment allowed');
   perform pg_temp.denied(format('select public.record_service_exception_resolution(%L,%L,%L)',sid,'00000082-0000-4000-8000-000000000998','[]'));
   update public.payments set status='PAID',transaction_id='TEST-EXTRA-TID',paid_at=now(),pay_token=null,token_expires_at=null
    where reservation_id=rid and type='EXTENSION';
  end if;
  select jsonb_agg(jsonb_build_object('paymentId',p.id,'orderId',p.order_id,'transactionId',p.transaction_id,'cash',t.cash,'balance',t.target_balance)) into verified
   from public.service_exception_transactions t join public.payments p on p.id=t.payment_id where t.service_id=sid;
  perform public.record_service_exception_resolution(sid,'00000082-0000-4000-8000-000000000998',verified);
  perform public.record_service_exception_resolution(sid,'00000082-0000-4000-8000-000000000998',verified);
  perform pg_temp.assert((select sum(gross_amount-discount_amount) from public.payments where reservation_id=rid and status='PAID')=(select final_cash from public.service_exception_resolutions where service_id=sid),'cash matches operator decision');
  perform pg_temp.assert((select sum(payout_amount) from public.payments where reservation_id=rid and status='PAID')=(select partner_payout from public.service_exception_resolutions where service_id=sid),'payout not double deducted by refund');
  perform pg_temp.assert((select count(*) from public.settlements where service_id=sid)=1,'one final settlement');
  perform pg_temp.assert((select net from public.settlements where service_id=sid)=(select partner_payout from public.service_exception_resolutions where service_id=sid),'settlement uses operator payout');
  perform pg_temp.assert((select status='COMPLETED' from public.services where id=sid),'hold released after processing');
 end loop;
end $$;
select pg_temp.assert((select state='RELEASED' and restored_by='00000082-0000-4000-8000-000000000998' and restored_at is not null from public.opening_event_claims where payment_id='00000082-0002-4000-8000-000000000001'),'benefit restored after full cash refund');
select pg_temp.assert((select used_count=0 and not active and not integration_ready from public.opening_campaign where id),'campaign activation unchanged');
select pg_temp.assert((select sum(amount)=0 from public.points where payment_id='00000082-0002-4000-8000-000000000005'),'zero cash full refund restores actual used points');
select pg_temp.assert((select count(*) from public.notifications where dedupe_key like 'exception-resolved:00000082-%')=5,'exactly one notification per resolution');
select pg_temp.assert((select count(*) from public.access_logs where action='SERVICE_EXCEPTION_RESOLVE' and actor_id='00000082-0000-4000-8000-000000000998')=5,'actual verification actor audited');
select set_config('request.jwt.claims','{"sub":"00000082-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.assert((public.get_own_service_exception_summary('00000082-0001-4000-8000-000000000002')->>'refund')::integer=58000,'weekend four-hour cash refund visible to owner');
select pg_temp.assert(not(public.get_own_service_exception_summary('00000082-0001-4000-8000-000000000002') ? 'partner_payout'),'partner finance excluded from customer summary');
reset role;
set constraints all immediate;
rollback;

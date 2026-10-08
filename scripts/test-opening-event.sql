begin;
-- Release 84 activates the event; test readiness blocking explicitly and roll it back.
update public.opening_campaign set active=false,integration_ready=false where id;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
select pg_temp.assert((select not enabled from public.opening_event_status()),'explicit inactive/readiness gate');
select pg_temp.assert(not has_function_privilege('authenticated','public.reserve_opening_event(uuid)','execute'),'client cannot reserve a benefit');
select pg_temp.assert(not has_table_privilege('anon','public.opening_event_identities','select') and not has_table_privilege('authenticated','public.opening_event_claims','update'),'identity and claim data private');
select pg_temp.assert(has_function_privilege('service_role','public.reserve_opening_event(uuid)','execute'),'trusted server can reserve');

insert into auth.users(id,email) values('00000159-0000-4000-8000-000000000999','event-partner@example.invalid');
insert into public.profiles(id,name,role) values('00000159-0000-4000-8000-000000000999','Event Test Partner','PARTNER');
do $$
declare i integer; uid uuid; rid uuid; pid uuid; plan_code text; hour_amount integer; gross integer; surcharge numeric;
begin
  for i in 1..23 loop
    uid:=('00000159-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    rid:=('00000159-0001-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    pid:=('00000159-0002-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    plan_code:=case when i%2=0 then 'basic' else 'plus' end;
    hour_amount:=case plan_code when 'plus' then 25000 else 20000 end;
    surcharge:=case when i%3=0 then 0.3 else 0 end;
    gross:=round(hour_amount*(case when i in (4,6) then 4 else 2 end)*(1+surcharge));
    insert into auth.users(id,email,email_confirmed_at) values(uid,'event-'||i||'@example.invalid',now());
    insert into public.profiles(id,name,role) values(uid,'Event Test','USER');
    insert into public.opening_event_identities(customer_id,identity_hash,verification_source,verified_at)
      values(uid,md5(uid::text)||md5(uid::text),'SUPABASE_EMAIL',now());
    insert into public.reservations(id,code,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address,status,confirmed_partner_id,payment_deadline,surcharge_rate,prepaid_amount)
    values(rid,'TEST-EVENT-'||i,uid,plan_code,'Test','1960-01-01','female','01000000000','Test','01000000000','self','Test','Test',((now() at time zone 'Asia/Seoul')::date+i),'10:00','10:30',case when i in (4,6) then '4시간' else '2시간' end,case when i in (4,6) then 240 else 120 end,'Test','Test','MATCHING','00000159-0000-4000-8000-000000000999',now()+interval '30 minutes',surcharge,gross);
    insert into public.payments(id,reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,commission_rate)
    values(pid,rid,'BASE','PENDING','TEST-EVENT-'||i,gross,0,round(gross*0.2),gross-round(gross*0.2),0.2);
  end loop;
end $$;
-- 관리자 이외 공개 호출과 MFA 미완료 관리자를 차단한다.
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
  begin perform public.admin_opening_event(); exception when insufficient_privilege then raise notice 'PASS: customer cannot manage campaign'; return; end;
  raise exception 'FAIL: customer management bypass';
end $$;
reset role;
insert into auth.users(id,email) values('00000159-0000-4000-8000-000000000998','event-admin@example.invalid');
insert into public.profiles(id,name,role) values('00000159-0000-4000-8000-000000000998','Event Test Admin','ADMIN');
insert into public.admin_accounts(profile_id,duty) values('00000159-0000-4000-8000-000000000998','전체');
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000998","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
  begin perform public.admin_opening_event(); exception when insufficient_privilege then raise notice 'PASS: admin without MFA rejected'; return; end;
  raise exception 'FAIL: missing MFA bypass';
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000998","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select pg_temp.assert((public.admin_opening_event()->>'ready')::boolean=false,'MFA admin can read readiness');
do $$ begin
  begin perform public.admin_set_opening_event(true,'TEST ENABLE BEFORE READY'); exception when check_violation then raise notice 'PASS: cannot enable before integration ready'; return; end;
  raise exception 'FAIL: readiness gate bypass';
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
update public.opening_campaign set active=true,integration_ready=true,used_count=0 where id;
select pg_temp.assert((select enabled from public.opening_event_status()),'ready active campaign visible');
-- 보유자가 아닌 예약의 자격 조회를 차단한다.
set local role authenticated;
do $$ begin
  begin perform public.opening_event_offer('00000159-0001-4000-8000-000000000002'); exception when insufficient_privilege then raise notice 'PASS: other customer offer hidden'; return; end;
  raise exception 'FAIL: offer ownership bypass';
end $$;
reset role;
-- 본인인증 미확인, 제외 계정, 포인트 중복, 금액 불일치를 실제 reserve RPC로 검증.
delete from public.opening_event_identities where customer_id='00000159-0000-4000-8000-000000000023';
do $$ begin
  begin perform public.reserve_opening_event('00000159-0002-4000-8000-000000000023'); exception when check_violation then raise notice 'PASS: unverified identity rejected'; return; end;
  raise exception 'FAIL: missing identity bypass';
end $$;
update public.opening_event_identities set excluded=true where customer_id='00000159-0000-4000-8000-000000000022';
do $$ begin
  begin perform public.reserve_opening_event('00000159-0002-4000-8000-000000000022'); exception when check_violation then raise notice 'PASS: excluded test account rejected'; return; end;
  raise exception 'FAIL: excluded account bypass';
end $$;
update public.payments set gross_amount=gross_amount+1,commission_amount=commission_amount+1 where id='00000159-0002-4000-8000-000000000021';
do $$ begin
  begin perform public.reserve_opening_event('00000159-0002-4000-8000-000000000021'); exception when check_violation then raise notice 'PASS: noncanonical amount rejected'; return; end;
  raise exception 'FAIL: invalid amount bypass';
end $$;
update public.payments set gross_amount=gross_amount-1,commission_amount=commission_amount-1 where id='00000159-0002-4000-8000-000000000021';
update public.payments set discount_amount=100,commission_amount=commission_amount-100 where id='00000159-0002-4000-8000-000000000021';
do $$ begin
  begin perform public.reserve_opening_event('00000159-0002-4000-8000-000000000021'); exception when check_violation then raise notice 'PASS: point discount stacking rejected'; return; end;
  raise exception 'FAIL: stacked discount bypass';
end $$;
update public.payments set discount_amount=0,commission_amount=commission_amount+100 where id='00000159-0002-4000-8000-000000000021';

select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert(public.opening_event_coupon()->>'state'='AVAILABLE','new customer coupon auto visible');
select pg_temp.assert((public.opening_event_offer('00000159-0001-4000-8000-000000000001')->>'discount')::integer=25000,'offer uses common coupon amount');
select pg_temp.assert((select used_count=0 from public.opening_campaign),'wallet does not consume capacity');
select public.reserve_opening_event('00000159-0002-4000-8000-000000000001');
select pg_temp.assert(public.reserve_opening_event('00000159-0002-4000-8000-000000000001')=25000,'same payment reserve idempotent');
savepoint review_states;
update public.opening_campaign set active=false where id;
select pg_temp.assert(public.opening_event_coupon()->>'state'='PAUSED','paused campaign overrides live hold');
select pg_temp.assert((public.opening_event_offer('00000159-0001-4000-8000-000000000001')->>'eligible')::boolean=false,'paused held offer cannot be selected');
do $$ begin
  begin perform public.reserve_opening_event('00000159-0002-4000-8000-000000000001');
  exception when check_violation then raise notice 'PASS: paused existing hold cannot prepare'; return; end;
  raise exception 'FAIL: paused hold accepted';
end $$;
delete from public.opening_event_identities where customer_id='00000159-0000-4000-8000-000000000023';
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000023","role":"authenticated"}',true);
select pg_temp.assert(public.opening_event_coupon()->>'state'='PAUSED','missing identity still sees campaign pause');
update public.opening_campaign set closed_at=now() where id;
select pg_temp.assert(public.opening_event_coupon()->>'state'='CLOSED','missing identity still sees campaign closure');
rollback to review_states;
savepoint review_cancel;
update public.reservations set status='CANCELLED' where id='00000159-0001-4000-8000-000000000001';
select pg_temp.assert((select state='RELEASED' from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000001'),'cancelled pending reservation immediately releases hold');
select pg_temp.assert(public.opening_event_coupon()->>'state'='AVAILABLE','cancelled reservation is not shown as held');
select pg_temp.assert((public.opening_event_offer('00000159-0001-4000-8000-000000000001')->>'eligible')::boolean=false,'cancelled reservation offer ineligible');
rollback to review_cancel;
select pg_temp.assert((select gross_amount-discount_amount=25000 and payout_amount=40000 from public.payments where id='00000159-0002-4000-8000-000000000001'),'Plus first hour free; normal partner payout');
update public.opening_event_identities set identity_hash=(select identity_hash from public.opening_event_identities where customer_id='00000159-0000-4000-8000-000000000001') where customer_id='00000159-0000-4000-8000-000000000021';
do $$ begin
  begin perform public.reserve_opening_event('00000159-0002-4000-8000-000000000021'); exception when check_violation then raise notice 'PASS: another account with same identity rejected'; return; end;
  raise exception 'FAIL: duplicate verified identity bypass';
end $$;
update public.opening_event_identities set identity_hash=md5(customer_id::text)||md5(customer_id::text) where customer_id='00000159-0000-4000-8000-000000000021';
update public.opening_event_identities set excluded=false where customer_id='00000159-0000-4000-8000-000000000022';
select public.reserve_opening_event('00000159-0002-4000-8000-000000000022');
update public.opening_event_claims set expires_at=now()-interval '1 minute' where payment_id='00000159-0002-4000-8000-000000000022';
do $$ begin
  begin perform public.finalize_payment('00000159-0002-4000-8000-000000000022','TEST-EXPIRED',now()); exception when check_violation then raise notice 'PASS: expired benefit cannot finalize discounted payment'; return; end;
  raise exception 'FAIL: expired discounted payment accepted';
end $$;
select public.reserve_opening_event('00000159-0002-4000-8000-000000000001');
select pg_temp.assert((select state='RELEASED' from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000022'),'expired hold releases capacity');
-- 실패하면 순번을 부여하지 않고 임시 확보를 해제한다.
update public.payments set status='FAILED' where id='00000159-0002-4000-8000-000000000001';
select pg_temp.assert((select state='RELEASED' and sequence is null from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000001'),'failed payment releases hold only');
-- 재시도는 새 결제 행으로 수행한다.
insert into public.payments(id,reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,commission_rate)
values('00000159-0002-4000-8000-000000000101','00000159-0001-4000-8000-000000000001','BASE','PENDING','TEST-EVENT-RETRY',50000,0,10000,40000,0.2);
select public.reserve_opening_event('00000159-0002-4000-8000-000000000101');
do $$ declare i integer; begin
  for i in 2..20 loop perform public.reserve_opening_event(('00000159-0002-4000-8000-'||lpad(i::text,12,'0'))::uuid); end loop;
end $$;
select pg_temp.assert((select count(*)=20 from public.opening_event_claims where state='HELD'),'20 holds fit capacity');
select pg_temp.assert((select gross_amount-discount_amount=15000 and payout_amount=32000 from public.payments where id='00000159-0002-4000-8000-000000000002'),'Basic 25000 coupon; normal payout');
-- 기존 결제창에 확보된 20,000원 혜택은 재조회해도 소급 변경하지 않는다.
update public.opening_event_claims set discount_amount=20000 where payment_id='00000159-0002-4000-8000-000000000002';
update public.payments set campaign_discount_amount=20000,discount_amount=20000,commission_amount=-12000 where id='00000159-0002-4000-8000-000000000002';
select pg_temp.assert(public.reserve_opening_event('00000159-0002-4000-8000-000000000002')=20000,'legacy hold keeps original amount');
-- 실제 prepare 재시도: 이전 PENDING을 취소하고 새 결제 행으로 확보한다.
update public.payments set status='CANCELLED' where id='00000159-0002-4000-8000-000000000002';
insert into public.payments(id,reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,commission_rate)
values('00000159-0002-4000-8000-000000000102','00000159-0001-4000-8000-000000000002','BASE','PENDING','TEST-EVENT-LEGACY-RETRY',40000,0,8000,32000,0.2);
select pg_temp.assert(public.reserve_opening_event('00000159-0002-4000-8000-000000000102')=25000,'new payment retry gets current 25000 coupon');
select pg_temp.assert((select state='RELEASED' and discount_amount=20000 from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000002'),'retry preserves released historical amount');
update public.opening_event_claims set discount_amount=25000 where payment_id='00000159-0002-4000-8000-000000000102';
update public.payments set campaign_discount_amount=25000,discount_amount=25000,commission_amount=-17000 where id='00000159-0002-4000-8000-000000000102';
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000021","role":"authenticated"}',true);
select pg_temp.assert(public.opening_event_coupon()->>'state'='WAITING','full temporary holds do not mean exhaustion');
select pg_temp.assert((select gross_amount-discount_amount=40000 and payout_amount=52000 from public.payments where id='00000159-0002-4000-8000-000000000003'),'weekend surcharge not discounted');
do $$ begin
  begin perform public.reserve_opening_event('00000159-0002-4000-8000-000000000021'); exception when check_violation then raise notice 'PASS: 21st hold rejected'; return; end;
  raise exception 'FAIL: capacity exceeded';
end $$;
-- 결제·예약 확정 트랜잭션이 실패하면 USED 순번도 롤백한다.
update public.reservations set use_date=(now() at time zone 'Asia/Seoul')::date+60 where id='00000159-0001-4000-8000-000000000020';
do $$ begin
  begin perform public.finalize_payment('00000159-0002-4000-8000-000000000020','TEST-TID',now()); exception when others then
    if exists(select 1 from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000020' and state='USED') then raise exception 'FAIL: failed confirmation consumed sequence'; end if;
    raise notice 'PASS: confirmation failure rolls back claim'; return;
  end;
  raise exception 'FAIL: invalid future reservation confirmed';
end $$;
update public.reservations set use_date=(now() at time zone 'Asia/Seoul')::date+20 where id='00000159-0001-4000-8000-000000000020';
select public.finalize_payment('00000159-0002-4000-8000-000000000101','TEST-TID-1',now());
select pg_temp.assert((select sequence=1 from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000101'),'first confirmed sequence 1');
-- 취소 후에도 USED가 남는다.
update public.reservations set status='CANCELLED' where id='00000159-0001-4000-8000-000000000001';
select pg_temp.assert((select state='USED' from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000101'),'confirmed cancellation does not restore benefit');
do $$ declare i integer; begin
  for i in 2..20 loop if i=2 then perform public.finalize_payment('00000159-0002-4000-8000-000000000102','TEST-TID-2',now()); continue; end if; perform public.finalize_payment(('00000159-0002-4000-8000-'||lpad(i::text,12,'0'))::uuid,'TEST-TID-'||i,now()); end loop;
end $$;
select pg_temp.assert((select count(*)=20 and max(sequence)=20 from public.opening_event_claims where state='USED'),'exactly 20 confirmed users');
select pg_temp.assert((select not enabled and remaining=0 from public.opening_event_status()),'exhaustion hides popup');
select public.finalize_payment('00000159-0002-4000-8000-000000000020','TEST-TID-20',now());
select pg_temp.assert((select used_count=20 from public.opening_campaign),'duplicate finalization does not use sequence');
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000021","role":"authenticated"}',true);
select pg_temp.assert(public.opening_event_coupon()->>'state'='EXHAUSTED','unused coupon shows exhausted');
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert(public.opening_event_coupon()->>'state'='USED','own used coupon remains visible');
-- 이메일 인증은 auth.users의 서버 확인 값으로 검사한다.
select pg_temp.assert(not has_function_privilege('authenticated','public.register_opening_event_email(uuid,text)','execute'),'client cannot register verified email');
update auth.users set email_confirmed_at=null where id='00000159-0000-4000-8000-000000000023';
do $$ begin
  begin perform public.register_opening_event_email('00000159-0000-4000-8000-000000000023',repeat('a',64));
  exception when check_violation then raise notice 'PASS: unconfirmed email rejected'; return; end;
  raise exception 'FAIL: unconfirmed email accepted';
end $$;
update auth.users set email_confirmed_at=now() where id='00000159-0000-4000-8000-000000000023';
select public.register_opening_event_email('00000159-0000-4000-8000-000000000023',repeat('a',64));
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000998","role":"authenticated","aal":"aal2"}',true);
select public.admin_exclude_opening_event('00000159-0000-4000-8000-000000000023',true,'TEST STAFF EXCLUSION');
select pg_temp.assert(exists(select 1 from public.opening_event_exclusions where customer_id='00000159-0000-4000-8000-000000000023'),'staff exclusion has separate auditable record');
update public.opening_event_identities set excluded=true where customer_id='00000159-0000-4000-8000-000000000023';
do $$ begin
  begin perform public.register_opening_event_email('00000159-0000-4000-8000-000000000023',repeat('b',64));
  exception when check_violation then raise notice 'PASS: excluded user does not refresh identity'; return; end;
  raise exception 'FAIL: excluded user identity refreshed';
end $$;
select pg_temp.assert((select excluded from public.opening_event_identities where customer_id='00000159-0000-4000-8000-000000000023'),'email refresh preserves staff exclusion');

-- 정상 1시간 종료: 할인은 고객에게 적용하고 파트너 1시간 지급액은 유지한다.
-- Basic 2시간 노쇼: 현금 15,000 + 추가결제 5,000 = 할인 없는 노쇼 20,000.
update public.reservations set final_amount=20000,billed_minutes=60 where id='00000159-0001-4000-8000-000000000008';
update public.services set status='COMPLETED',no_show=true where reservation_id='00000159-0001-4000-8000-000000000008';
select pg_temp.assert((select gross_amount-discount_amount=15000 and payout_amount=12000 from public.payments where id='00000159-0002-4000-8000-000000000008'),'2-hour no-show preserves cash 15000 and removes subsidy');
select public.create_extension_payment('00000159-0001-4000-8000-000000000008',5000,'NO_SHOW','TEST-NO-SHOW-2H','TEST-NO-SHOW-2H-TOKEN',now()+interval '1 hour',150000);
select public.finalize_extension_payment((select id from public.payments where order_id='TEST-NO-SHOW-2H'),'TEST-NO-SHOW-2H-TID');
select pg_temp.assert((select sum(gross_amount-discount_amount)=20000 and sum(payout_amount)=16000 from public.payments where reservation_id='00000159-0001-4000-8000-000000000008' and status='PAID'),'2-hour no-show additional paid ledger totals 20000 and partner 16000');
select pg_temp.assert((select sum(net)=16000 from public.settlements st join public.services s on s.id=st.service_id where s.reservation_id='00000159-0001-4000-8000-000000000008'),'2-hour no-show extension settlement totals 16000');
select public.finalize_extension_payment((select id from public.payments where order_id='TEST-NO-SHOW-2H'),'TEST-NO-SHOW-2H-TID');
select pg_temp.assert((select count(*)=2 from public.settlements st join public.services s on s.id=st.service_id where s.reservation_id='00000159-0001-4000-8000-000000000008'),'duplicate extension confirm does not duplicate settlement');
savepoint review_registration;
delete from public.opening_event_identities where customer_id='00000159-0000-4000-8000-000000000008';
do $$ begin
  begin perform public.register_opening_event_email('00000159-0000-4000-8000-000000000008',repeat('c',64));
  exception when check_violation then raise notice 'PASS: completed customer not newly registered'; return; end;
  raise exception 'FAIL: ineligible identity stored';
end $$;
select pg_temp.assert(not exists(select 1 from public.opening_event_identities where customer_id='00000159-0000-4000-8000-000000000008'),'ineligible wallet visits do not collect new HMAC');
rollback to review_registration;
-- 추가결제를 먼저 받은 후 서비스 완료하는 순서도 검증한다.
update public.reservations set final_amount=45000 where id='00000159-0001-4000-8000-000000000010';
select public.create_extension_payment('00000159-0001-4000-8000-000000000010',5000,'EXTENSION','TEST-EVENT-EXT-FIRST','TEST-EVENT-EXT-FIRST-TOKEN',now()+interval '1 hour',150000);
select public.finalize_extension_payment((select id from public.payments where order_id='TEST-EVENT-EXT-FIRST'),'TEST-EVENT-EXT-FIRST-TID');
select pg_temp.assert(not exists(select 1 from public.settlements st join public.services s on s.id=st.service_id where s.reservation_id='00000159-0001-4000-8000-000000000010'),'no settlement before completion');
update public.services set status='COMPLETED' where reservation_id='00000159-0001-4000-8000-000000000010';
select pg_temp.assert((select sum(net)=36000 from public.settlements st join public.services s on s.id=st.service_id where s.reservation_id='00000159-0001-4000-8000-000000000010'),'paid-before-complete extension included once');
update public.reservations set final_amount=20000,billed_minutes=60 where id='00000159-0001-4000-8000-000000000002';
update public.services set status='COMPLETED' where reservation_id='00000159-0001-4000-8000-000000000002';
select pg_temp.assert((select net=32000 and amount=15000 and fee=-17000 from public.settlements where payment_id='00000159-0002-4000-8000-000000000102'),'event primary ledger uses paid base without double final charge');
insert into public.refund_requests(reservation_id,payment_id,amount,status,reason)
  values('00000159-0001-4000-8000-000000000002','00000159-0002-4000-8000-000000000102',15000,'APPROVED','TEST EVENT EARLY END');
select public.record_settlement_refund((select id from public.refund_requests where reservation_id='00000159-0001-4000-8000-000000000002'));
select pg_temp.assert((select sum(net)=16000 from public.settlements st join public.services s on s.id=st.service_id where s.reservation_id='00000159-0001-4000-8000-000000000002'),'early completion refund keeps one-hour partner payout');
update public.reservations set final_amount=20000,billed_minutes=60 where id='00000159-0001-4000-8000-000000000004';
update public.services set status='COMPLETED',no_show=true where reservation_id='00000159-0001-4000-8000-000000000004';
select pg_temp.assert((select net=44000 and amount=55000 from public.settlements where payment_id='00000159-0002-4000-8000-000000000004'),'4-hour no-show primary ledger preserves cash received');
select pg_temp.assert((select gross_amount=80000 and discount_amount=25000 and commission_amount=11000 and payout_amount=44000 and gross_amount-discount_amount-commission_amount=payout_amount from public.payments where id='00000159-0002-4000-8000-000000000004'),'4-hour no-show payment split remains valid');
insert into public.refund_requests(reservation_id,payment_id,amount,status,reason)
  values('00000159-0001-4000-8000-000000000004','00000159-0002-4000-8000-000000000004',35000,'APPROVED','TEST 4H NO SHOW');
select public.record_settlement_refund((select id from public.refund_requests where reservation_id='00000159-0001-4000-8000-000000000004'));
select public.record_settlement_refund((select id from public.refund_requests where reservation_id='00000159-0001-4000-8000-000000000004'));
select pg_temp.assert((select sum(st.net)=16000 and sum(st.amount)=20000 from public.settlements st join public.services s on s.id=st.service_id where s.reservation_id='00000159-0001-4000-8000-000000000004'),'4-hour no-show refund deducted once; one-hour partner net positive');
select pg_temp.assert((select sum(gross_amount-discount_amount)=20000 and sum(payout_amount)=16000 from public.payments where reservation_id='00000159-0001-4000-8000-000000000004' and status='PAID'),'4-hour no-show payment totals equal settlement');
update public.reservations set final_amount=26000,billed_minutes=60 where id='00000159-0001-4000-8000-000000000006';
update public.services set status='COMPLETED',no_show=true where reservation_id='00000159-0001-4000-8000-000000000006';
select pg_temp.assert((select gross_amount=104000 and discount_amount=25000 and commission_amount=15800 and payout_amount=63200 and gross_amount-discount_amount-commission_amount=payout_amount from public.payments where id='00000159-0002-4000-8000-000000000006'),'4-hour weekend/holiday no-show split remains valid');
insert into public.refund_requests(reservation_id,payment_id,amount,status,reason)
  values('00000159-0001-4000-8000-000000000006','00000159-0002-4000-8000-000000000006',53000,'APPROVED','TEST SURCHARGE NO SHOW');
select public.record_settlement_refund((select id from public.refund_requests where reservation_id='00000159-0001-4000-8000-000000000006'));
select pg_temp.assert((select sum(st.net)=20800 and sum(st.amount)=26000 from public.settlements st join public.services s on s.id=st.service_id where s.reservation_id='00000159-0001-4000-8000-000000000006'),'weekend/holiday no-show refund leaves one-hour surcharge net');
select pg_temp.assert((select sum(gross_amount-discount_amount)=26000 and sum(payout_amount)=20800 from public.payments where reservation_id='00000159-0001-4000-8000-000000000006' and status='PAID'),'weekend/holiday no-show payment totals equal settlement');

-- 회사/파트너 귀책 복원은 MFA 정산 담당자의 명시 확인과 실제 전액 환불 기록이 필요하다.
select set_config('test.restore_claim_id',(select id::text from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000101'),true);
select set_config('request.jwt.claims','{"sub":"00000159-0000-4000-8000-000000000998","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$ begin
  begin perform public.admin_restore_opening_event(current_setting('test.restore_claim_id')::uuid,'TEST PROVIDER FAULT');
  exception when check_violation then raise notice 'PASS: benefit cannot restore before full refund'; return; end;
  raise exception 'FAIL: benefit restored without refund';
end $$;
reset role;
insert into public.payments(reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,commission_rate)
  values('00000159-0001-4000-8000-000000000001','REFUND','PAID','TEST-EVENT-PROVIDER-REFUND',-25000,0,0,-25000,0);
select public.admin_restore_opening_event((select id from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000101'),'TEST PROVIDER FAULT CONFIRMED');
select pg_temp.assert((select state='RELEASED' and restored_sequence=1 and restored_confirmed_at is not null and restored_by is not null from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000101'),'restoration retains original sequence/time/actor audit');
select pg_temp.assert((select used_count=19 from public.opening_campaign),'provider failure frees capacity');
update public.opening_event_identities set identity_hash=md5('00000159-0000-4000-8000-000000000001')||md5('00000159-0000-4000-8000-000000000001') where customer_id='00000159-0000-4000-8000-000000000021';
select public.reserve_opening_event('00000159-0002-4000-8000-000000000021');
select public.finalize_payment('00000159-0002-4000-8000-000000000021','TEST-RESTORED-EMAIL',now());
select pg_temp.assert((select sequence=1 from public.opening_event_claims where payment_id='00000159-0002-4000-8000-000000000021'),'rebooking reuses free slot without duplicate sequence');
select pg_temp.assert((select used_count=20 from public.opening_campaign),'rebooking remains within capacity');
select pg_temp.assert(public.purge_closed_opening_event_identities()=0,'active campaign identity not purged');
select public.admin_close_opening_event('TEST EVENT CLOSED');
select pg_temp.assert(public.purge_closed_opening_event_identities()=0,'unfinished related reservations delay identity purge');
update public.reservations set status='COMPLETED' where id::text like '00000159-%' and status<>'CANCELLED';
select pg_temp.assert(public.purge_closed_opening_event_identities()=0,'pending related payment delays identity purge');
update public.payments set status='FAILED' where id::text like '00000159-%' and status='PENDING';
select pg_temp.assert(public.purge_closed_opening_event_identities()>0,'closed and resolved campaign identity purged');
select pg_temp.assert(not exists(select 1 from public.opening_event_exclusions),'closed campaign exclusion identifiers purged');
select pg_temp.assert(not exists(select 1 from public.opening_event_claims where identity_hash is not null),'claim HMAC also purged while transaction/audit remain');
do $$ begin
  begin perform public.register_opening_event_email('00000159-0000-4000-8000-000000000023',repeat('c',64));
  exception when check_violation then raise notice 'PASS: closed campaign cannot recollect email hash'; return; end;
  raise exception 'FAIL: closed campaign recollection';
end $$;
rollback;

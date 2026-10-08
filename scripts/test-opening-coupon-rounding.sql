-- #283 리뷰. 할증이 있는 선결제도 lib/pricing.ts calcPrepayment 값으로 쿠폰을 확보한다.
-- 기대값은 TS 계산(기본요금 반올림 → 할증 반올림)에서 가져왔다(lib/__tests__/pricing.test.ts 와 같은 값).
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
update public.opening_campaign set active=true,integration_ready=true,closed_at=null,used_count=0,capacity=20 where id;
delete from public.opening_event_claims where state='HELD';

insert into auth.users(id,email) values('00000283-0000-4000-8000-000000000999','round-partner@example.invalid');
insert into public.profiles(id,name,role) values('00000283-0000-4000-8000-000000000999','Rounding Partner','PARTNER');
do $$
declare i integer; uid uuid; rid uuid; pid uuid; c record;
begin
  -- [요금제, 분, 할증률, TS 선결제액]. 3번은 103 의 한 번 반올림 값(TS 와 1원 다름)으로 거절돼야 한다.
  for c in select * from (values
    (1,'basic',121,0.1,44366),(2,'plus',125,0.1,57291),(3,'basic',121,0.1,44367)
  ) v(n,plan_code,minutes,rate,gross) loop
    i:=c.n;
    uid:=('00000283-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    rid:=('00000283-0001-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    pid:=('00000283-0002-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,email,email_confirmed_at) values(uid,'round-'||i||'@example.invalid',now());
    insert into public.profiles(id,name,role) values(uid,'Rounding Test','USER');
    insert into public.opening_event_identities(customer_id,identity_hash,verification_source,verified_at)
      values(uid,md5(uid::text)||md5(uid::text),'SUPABASE_EMAIL',now());
    insert into public.reservations(id,code,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address,status,confirmed_partner_id,payment_deadline,surcharge_rate,prepaid_amount)
    values(rid,'TEST-ROUND-'||i,uid,c.plan_code,'Test','1960-01-01','female','01000000000','Test','01000000000','self','Test','Test',((now() at time zone 'Asia/Seoul')::date+i),'10:00','10:30','2시간',c.minutes,'Test','Test','MATCHING','00000283-0000-4000-8000-000000000999',now()+interval '30 minutes',c.rate,c.gross);
    insert into public.payments(id,reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,commission_rate)
    values(pid,rid,'BASE','PENDING','TEST-ROUND-'||i,c.gross,0,round(c.gross*0.2),c.gross-round(c.gross*0.2),0.2);
  end loop;
end $$;

select pg_temp.assert(public.reserve_opening_event('00000283-0002-4000-8000-000000000001')=25000,'basic 121분 할증 10% TS 금액으로 쿠폰 확보');
select pg_temp.assert(public.reserve_opening_event('00000283-0002-4000-8000-000000000002')=25000,'plus 125분 할증 10% TS 금액으로 쿠폰 확보');
do $$ begin
  begin perform public.reserve_opening_event('00000283-0002-4000-8000-000000000003');
  exception when check_violation then raise notice 'PASS: TS 와 다른 금액은 거절'; return; end;
  raise exception 'FAIL: noncanonical surcharge amount accepted';
end $$;
rollback;

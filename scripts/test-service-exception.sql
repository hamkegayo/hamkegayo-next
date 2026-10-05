begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
create function pg_temp.denied(sql text) returns void language plpgsql as $$ begin begin execute sql; exception when others then return; end; raise exception 'expected denied'; end; $$;
insert into auth.users(id,email) values ('00000185-0000-4000-8000-000000000001','exception-partner@example.invalid'),('00000185-0000-4000-8000-000000000002','exception-owner@example.invalid');
insert into public.profiles(id,name,role) values ('00000185-0000-4000-8000-000000000001','Exception Partner','PARTNER'),('00000185-0000-4000-8000-000000000002','Exception Owner','USER');
insert into public.partner_accounts(profile_id,login_id) values ('00000185-0000-4000-8000-000000000001','exception-test-185');
insert into public.reservations(id,code,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address)
values ('00000185-0000-4000-8000-000000000003','TEST-EXCEPTION-185','00000185-0000-4000-8000-000000000002','basic','Test','1960-01-01','female','01000000000','Test','01000000000','self','Test','Test','2099-01-01','09:00','09:00','2시간',120,'Test','Test');
insert into public.services(id,reservation_id,partner_id,status,started_at) values ('00000185-0000-4000-8000-000000000004','00000185-0000-4000-8000-000000000003','00000185-0000-4000-8000-000000000001','IN_PROGRESS',now()-interval '1 hour');
select set_config('request.jwt.claims','{"sub":"00000185-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.end_service_exception('00000185-0000-4000-8000-000000000004','EMERGENCY')$q$);
reset role;
select set_config('request.jwt.claims','{"sub":"00000185-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.end_service_exception('00000185-0000-4000-8000-000000000004','EMERGENCY','Test interruption');
select pg_temp.denied($q$select public.complete_service('00000185-0000-4000-8000-000000000004')$q$);
reset role;
select pg_temp.assert(status='ENDED' and termination_kind='EMERGENCY' and ended_at is not null,'exception time recorded without completion') from public.services where id='00000185-0000-4000-8000-000000000004';
select pg_temp.denied($q$insert into public.payments(reservation_id,type,status,order_id,gross_amount,payout_amount) values ('00000185-0000-4000-8000-000000000003','EXTENSION','PENDING','TEST-EXTRA-185',1000,1000)$q$);
select pg_temp.denied($q$insert into public.payments(reservation_id,type,status,order_id,gross_amount,payout_amount) values ('00000185-0000-4000-8000-000000000003','REFUND','PAID','TEST-REFUND-185',-1000,-1000)$q$);
select pg_temp.assert(not exists(select 1 from public.settlements where service_id='00000185-0000-4000-8000-000000000004'),'no settlement before review');
update public.services set termination_kind='NORMAL',status='IN_PROGRESS',ended_at=null where id='00000185-0000-4000-8000-000000000004';
set local role authenticated;
select public.end_service_classified('00000185-0000-4000-8000-000000000004','CUSTOMER_EARLY','Customer request');
reset role;
select pg_temp.assert(termination_kind='CUSTOMER_EARLY','normal early termination classified') from public.services where id='00000185-0000-4000-8000-000000000004';
-- 100건을 넘는 대기 목록을 같은 종료 시각으로 만들고 id 정렬·다음 페이지를 검사한다.
insert into public.reservations(id,code,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address)
select gen_random_uuid(),'TEST-EXCEPTION-PAGE-'||i,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address
from public.reservations cross join generate_series(1,115) i where id='00000185-0000-4000-8000-000000000003';
insert into public.services(reservation_id,partner_id,status,started_at,ended_at,termination_kind)
select id,'00000185-0000-4000-8000-000000000001','ENDED',now()-interval '1 hour',now(),'EMERGENCY' from public.reservations where code like 'TEST-EXCEPTION-PAGE-%';
insert into auth.users(id,email) values('00000185-0000-4000-8000-000000000005','exception-admin@example.invalid');
insert into public.profiles(id,name,role) values('00000185-0000-4000-8000-000000000005','Exception Admin','ADMIN');
insert into public.admin_accounts(profile_id,duty) values('00000185-0000-4000-8000-000000000005','정산');
-- 오래된 완료 120건이 미처리 115건 앞의 페이지를 차지하지 않아야 한다.
insert into public.reservations(id,code,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address)
select gen_random_uuid(),'TEST-EXCEPTION-RESOLVED-'||i,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address
from public.reservations cross join generate_series(1,120) i where id='00000185-0000-4000-8000-000000000003';
insert into public.services(reservation_id,partner_id,status,started_at,ended_at,termination_kind)
select id,'00000185-0000-4000-8000-000000000001','COMPLETED',now()-interval '2 days',now()-interval '1 day',
 case when right(code,1) in ('0','2','4','6','8') then 'PROVIDER_FAULT' else 'EMERGENCY' end
from public.reservations where code like 'TEST-EXCEPTION-RESOLVED-%';
insert into public.service_exception_resolutions(service_id,decision,cash_before,final_cash,partner_payout,reason,evidence_reference,decided_by,resolved_by,resolved_at)
select s.id,case when s.termination_kind='EMERGENCY' then 'EMERGENCY' else 'UNAVAILABLE' end,0,0,0,
 'Completed test resolution','PRIVATE-COMPLETED-EVIDENCE','00000185-0000-4000-8000-000000000005','00000185-0000-4000-8000-000000000005',now()-interval '1 day'
from public.services s join public.reservations r on r.id=s.reservation_id where r.code like 'TEST-EXCEPTION-RESOLVED-%';
select set_config('request.jwt.claims','{"sub":"00000185-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.admin_list_service_exceptions())=101,'first page includes next-page marker');
select pg_temp.assert((select count(*) from public.admin_list_service_exceptions(100))=15,'new waiting items reachable after first hundred');
select pg_temp.assert(not exists(select 1 from public.admin_list_service_exceptions() where reservation_code like 'TEST-EXCEPTION-RESOLVED-%'),'resolved provider fault and emergency excluded before pagination');
select pg_temp.assert((select count(*) from public.admin_list_service_exceptions(200))=0,'completed history does not create extra waiting pages');
select pg_temp.assert(not exists(select 1 from (select service_id from public.admin_list_service_exceptions() limit 100) a join public.admin_list_service_exceptions(100) b using(service_id)),'same-time pages do not overlap');
select pg_temp.denied($q$select public.admin_list_service_exceptions(-1)$q$);
reset role;
rollback;

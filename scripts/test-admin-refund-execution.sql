begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
create function pg_temp.denied(sql text) returns void language plpgsql as $$ begin begin execute sql; exception when others then return; end; raise exception 'expected denied'; end; $$;
insert into auth.users(id,email) values ('00000079-0000-4000-8000-000000000001','refund-admin@example.invalid'),('00000079-0000-4000-8000-000000000002','refund-owner@example.invalid'),('00000079-0000-4000-8000-000000000003','refund-partner@example.invalid');
insert into public.profiles(id,name,role) values ('00000079-0000-4000-8000-000000000001','Admin','ADMIN'),('00000079-0000-4000-8000-000000000002','Owner','USER'),('00000079-0000-4000-8000-000000000003','Partner','PARTNER');
insert into public.admin_accounts(profile_id,duty) values ('00000079-0000-4000-8000-000000000001','정산');
insert into public.reservations(id,code,customer_id,plan,patient_name,patient_birth,patient_gender,patient_phone,guardian_name,guardian_phone,relation,treatment,purpose,use_date,arrive_time,reserve_time,duration,duration_minutes,depart_address,hospital_address)
values ('00000079-0000-4000-8000-000000000004','TEST-REFUND-79','00000079-0000-4000-8000-000000000002','basic','Test','1960-01-01','female','01000000000','Test','01000000000','self','Test','Test','2099-01-01','09:00','09:00','4시간',240,'Test','Test');
insert into public.payments(id,reservation_id,type,status,order_id,transaction_id,gross_amount,commission_amount,payout_amount,commission_rate) values ('00000079-0000-4000-8000-000000000005','00000079-0000-4000-8000-000000000004','BASE','PAID','TEST-REFUND-PAY','test-tid',80000,16000,64000,0.2);
insert into public.services(id,reservation_id,partner_id,status,started_at,ended_at) values ('00000079-0000-4000-8000-000000000006','00000079-0000-4000-8000-000000000004','00000079-0000-4000-8000-000000000003','ENDED','2099-01-01 00:00Z','2099-01-01 02:00Z');
insert into public.refund_requests(id,reservation_id,payment_id,amount) values ('00000079-0000-4000-8000-000000000007','00000079-0000-4000-8000-000000000004','00000079-0000-4000-8000-000000000005',40000);
select set_config('request.jwt.claims','{"sub":"00000079-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_prepare_refund('00000079-0000-4000-8000-000000000007','검토 후 환불')$q$);
reset role;
select set_config('request.jwt.claims','{"sub":"00000079-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
update public.admin_accounts set duty='계정' where profile_id='00000079-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.denied($q$select public.admin_refund_queue()$q$);
reset role;
update public.admin_accounts set duty='정산' where profile_id='00000079-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.denied($q$select public.admin_claim_refund('00000079-0000-4000-8000-000000000007','검토 후 환불',60000,'test-tid')$q$);
select public.admin_claim_refund('00000079-0000-4000-8000-000000000007','검토 후 환불',80000,'test-tid');
select pg_temp.denied($q$select public.admin_claim_refund('00000079-0000-4000-8000-000000000007','검토 후 환불',80000,'test-tid')$q$);
select pg_temp.denied($q$select public.record_verified_refund('00000079-0000-4000-8000-000000000007',40000,'test-tid')$q$);
reset role;
select pg_temp.denied($q$select public.record_verified_refund('00000079-0000-4000-8000-000000000007',30000,'test-tid')$q$);
-- 알림 저장 실패 시 원장까지 롤백된다. PG 재취소 없이 같은 조회 결과로 복구한다.
create function pg_temp.fail_refund_notification() returns trigger language plpgsql as $$ begin
 if new.dedupe_key='settlement-refund-completed:00000079-0000-4000-8000-000000000007' then raise exception 'simulated notification failure'; end if;return new;end;$$;
create trigger test_refund_notification_failure before insert on public.notifications for each row execute function pg_temp.fail_refund_notification();
select pg_temp.denied($q$select public.record_verified_refund('00000079-0000-4000-8000-000000000007',40000,'test-tid')$q$);
select pg_temp.assert(not exists(select 1 from public.payments where order_id='TEST-REFUND-PAY-S'),'notification failure rolls back refund ledger');
select pg_temp.assert((select status='APPROVED' from public.refund_requests where id='00000079-0000-4000-8000-000000000007'),'failed notification remains recoverable');
drop trigger test_refund_notification_failure on public.notifications;
select public.record_verified_refund('00000079-0000-4000-8000-000000000007',40000,'test-tid');
select public.record_verified_refund('00000079-0000-4000-8000-000000000007',40000,'test-tid');
select pg_temp.assert((select count(*) from public.notifications where dedupe_key='settlement-refund-completed:00000079-0000-4000-8000-000000000007' and recipient_id='00000079-0000-4000-8000-000000000002')=1,'exactly one customer refund notification');
-- 이전 원장 커밋 뒤 알림 누락과 같은 상태에서도 already=true 재조회가 복구한다.
delete from public.notifications where dedupe_key='settlement-refund-completed:00000079-0000-4000-8000-000000000007';
update public.refund_executions set notification_recorded_at=null where request_id='00000079-0000-4000-8000-000000000007';
select pg_temp.assert((public.record_verified_refund('00000079-0000-4000-8000-000000000007',40000,'test-tid')->>'already')::boolean,'already committed refund still restores notification');
select public.record_verified_refund('00000079-0000-4000-8000-000000000007',40000,'test-tid');
select pg_temp.assert((select count(*) from public.notifications where dedupe_key='settlement-refund-completed:00000079-0000-4000-8000-000000000007')=1,'recovery notification remains unique');
select pg_temp.assert((select count(*) from public.payments where order_id='TEST-REFUND-PAY-S')=1,'single refund ledger');
select pg_temp.assert((select status='COMPLETED' from public.refund_requests where id='00000079-0000-4000-8000-000000000007'),'completed after PG verification');
rollback;

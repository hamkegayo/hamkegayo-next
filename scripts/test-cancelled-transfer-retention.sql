-- #173 integration test. Transaction-local fixtures; always rolled back.
begin;
create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end;
$$;
create function pg_temp.denied(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    raise notice 'PASS: %', p_label;
    return;
  end;
  raise exception 'FAIL: %', p_label;
end;
$$;
insert into auth.users(id, email, raw_app_meta_data) values
('00000173-0000-4000-8000-000000000001', 'detail-owner@example.invalid', '{}'),
('00000173-0000-4000-8000-000000000002', 'detail-other@example.invalid', '{}'),
('00000173-0000-4000-8000-000000000003', 'detail-partner@example.invalid', '{}'),
('00000173-0000-4000-8000-000000000004', 'detail-admin@example.invalid', '{}');
insert into public.profiles(id, name, role) values
('00000173-0000-4000-8000-000000000001', 'Detail Owner', 'USER'),
('00000173-0000-4000-8000-000000000002', 'Detail Other', 'USER'),
('00000173-0000-4000-8000-000000000003', 'Detail Partner', 'PARTNER'),
('00000173-0000-4000-8000-000000000004', 'Detail Admin', 'ADMIN');
insert into public.partner_accounts(profile_id, login_id, intro) values
('00000173-0000-4000-8000-000000000003', 'detail-test-173', 'Actual introduction');
insert into public.admin_accounts(profile_id, duty) values ('00000173-0000-4000-8000-000000000004', '심사');
insert into public.reservations(id, code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone, guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address, hospital_address)
values ('00000173-0000-4000-8000-000000000005', 'TEST-DETAIL-173', '00000173-0000-4000-8000-000000000001', 'basic', 'Test', '1960-01-01', 'female', '01000000000', 'Test', '01000000000', 'self', 'Test', 'Test', '2099-01-01', '09:00', '09:00', '2시간', 120, 'Test', 'Test');
insert into public.reservation_applications(reservation_id, partner_id, status) values
('00000173-0000-4000-8000-000000000005', '00000173-0000-4000-8000-000000000003', 'ACCEPTED');
insert into public.partner_work_histories(id, partner_id, hospital, period, department, duties) values
('00000173-0000-4000-8000-000000000006', '00000173-0000-4000-8000-000000000003', 'Actual Hospital', '2022~2025', 'Outpatient', 'Actual duties');
insert into public.services(id, reservation_id, partner_id, status) values
('00000173-0000-4000-8000-000000000007', '00000173-0000-4000-8000-000000000005', '00000173-0000-4000-8000-000000000003', 'COMPLETED');
insert into public.reviews(service_id, customer_id, partner_id, rating, title, content, author_masked) values
('00000173-0000-4000-8000-000000000007', '00000173-0000-4000-8000-000000000001', '00000173-0000-4000-8000-000000000003', 4, 'Actual review', 'Actual public review content', 'D***');

insert into public.transfer_batches(id,code,status,reason,settlement_count,partner_count,total_net,created_by)
select ('00000191-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'TEST-191-'||i,'CANCELLED','test cancellation',1,1,100,'00000173-0000-4000-8000-000000000004' from generate_series(1,3) i;
insert into public.transfer_batch_items(batch_id,partner_id,amount,bank_code,account_number,account_last4,holder_name)
select id,'00000173-0000-4000-8000-000000000003',100,'004',null,'0000','Test only' from public.transfer_batches where code like 'TEST-191-%';
insert into public.transfer_batch_results(batch_id,status,recorded_by,recorded_at,reference,reason,settlement_ids)
select id,'CANCELLED','00000173-0000-4000-8000-000000000004',now()-case when code='TEST-191-2' then interval '1 year' else interval '6 years' end,'test-proof','test-reason',array[]::uuid[] from public.transfer_batches where code like 'TEST-191-%';
select pg_temp.assert((select purge_after=recorded_at+interval '5 years' from public.transfer_batch_results where batch_id='00000191-0000-4000-8000-000000000001'),'orphan result retains fixed deadline');
update public.transfer_batch_results set retention_reservation_ids=array['00000173-0000-4000-8000-000000000005'::uuid] where batch_id='00000191-0000-4000-8000-000000000003';
insert into public.retention_legal_holds(reservation_id,reason,held_by) values('00000173-0000-4000-8000-000000000005','Test legal hold','00000173-0000-4000-8000-000000000004');
select public.run_retention_purge();
select pg_temp.assert(not exists(select 1 from public.transfer_batches where code='TEST-191-1'),'expired orphan cancelled batch removed');
select pg_temp.assert(not exists(select 1 from public.transfer_batch_items where batch_id='00000191-0000-4000-8000-000000000001'),'items cascade removed');
select pg_temp.assert(not exists(select 1 from public.transfer_batch_results where batch_id='00000191-0000-4000-8000-000000000001'),'results cascade removed');
select pg_temp.assert(exists(select 1 from public.transfer_batches where code='TEST-191-2'),'fresh result retained');
select pg_temp.assert(exists(select 1 from public.transfer_batches where code='TEST-191-3'),'active legal hold retained');
update public.retention_legal_holds set released_at=now(),released_by=held_by,release_reason='Test hold release' where reservation_id='00000173-0000-4000-8000-000000000005';
select public.run_retention_purge();
select pg_temp.assert(not exists(select 1 from public.transfer_batches where code='TEST-191-3'),'released expired batch removed');
select public.run_retention_purge();
select pg_temp.assert(exists(select 1 from public.transfer_batches where code='TEST-191-2'),'repeat purge safe');
rollback;
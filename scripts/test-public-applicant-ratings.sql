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

update public.reviews set customer_id='00000173-0000-4000-8000-000000000002';
insert into public.review_publication_consents(id,source,review_id,subject_reference,consenting_party,evidence_reference,wording_version,wording_snapshot,consented_at,expires_at,allowed_items,verified_by)
select '00000190-0000-4000-8000-000000000001','site',id,'test-recipient','ACTUAL_RECIPIENT','test-proof','review-publication-2026-10-04-v1',repeat('test consent ',20),now(),now()+interval '3 years','["후기 공개본"]','00000173-0000-4000-8000-000000000004' from public.reviews where service_id='00000173-0000-4000-8000-000000000007';
insert into public.review_publications(source,review_id,consent_id,title,content,contains_health_information)
select 'site',id,'00000190-0000-4000-8000-000000000001','Published test','Published test content',false from public.reviews where service_id='00000173-0000-4000-8000-000000000007';
set local role anon;
select pg_temp.denied($q$select * from public.get_reservation_applicant_ratings('00000173-0000-4000-8000-000000000005')$q$,'anonymous denied');
reset role;
select set_config('request.jwt.claims','{"sub":"00000173-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.denied($q$select * from public.get_reservation_applicant_ratings('00000173-0000-4000-8000-000000000005')$q$,'foreign reservation denied');
reset role;
select set_config('request.jwt.claims','{"sub":"00000173-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.reviews),'raw review remains owner only');
select pg_temp.assert((select rating=4 and review_count=1 from public.get_reservation_applicant_ratings('00000173-0000-4000-8000-000000000005')),'another author public review counted');
reset role;
update public.review_publications set contains_health_information=true;
set local role authenticated;
select pg_temp.assert((select rating is null and review_count=0 from public.get_reservation_applicant_ratings('00000173-0000-4000-8000-000000000005')),'health gate excludes review');
reset role;
update public.review_publications set contains_health_information=false;
update public.review_publication_consents set consented_at=now()-interval '4 years',expires_at=now()-interval '1 year' where id='00000190-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert((select review_count=0 from public.get_reservation_applicant_ratings('00000173-0000-4000-8000-000000000005')),'expired review excluded');
reset role;
update public.review_publication_consents set consented_at=now(),expires_at=now()+interval '3 years',withdrawn_at=now() where id='00000190-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert((select review_count=0 from public.get_reservation_applicant_ratings('00000173-0000-4000-8000-000000000005')),'withdrawn review excluded');
reset role;
update public.reservation_applications set status='REJECTED' where reservation_id='00000173-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.get_reservation_applicant_ratings('00000173-0000-4000-8000-000000000005')),'non accepted partner omitted');
rollback;
-- #173 integration test. Transaction-local fixtures; always rolled back.
begin;
-- Release 83 enables production; explicitly test the disabled gate in this rollback fixture.
update public.partner_public_release set enabled=false;
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

set local role anon;
select pg_temp.denied($q$select public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')$q$, 'anonymous detail denied');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert(not public.partner_public_details_enabled(),'explicitly disabled public details gate');
select pg_temp.denied($q$select public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')$q$,'details blocked before notice release');
select pg_temp.denied('update public.partner_public_release set enabled=true','customer cannot enable release');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.denied('select public.set_partner_public_consent(true)','partner cannot consent before notice release');
select public.set_partner_public_consent(false);
select pg_temp.denied('select public.get_reservation_partner_detail_unreleased(null,null)','private detail cannot bypass release');
select pg_temp.denied('select public.set_partner_public_consent_unreleased(true)','private consent cannot bypass release');
reset role;
-- Transaction-local release only: verify the original ownership/consent controls too.
update public.partner_public_release set enabled=true;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.denied($q$select public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')$q$, 'foreign reservation denied');
select pg_temp.assert((select count(*) = 0 from public.partner_work_histories), 'foreign history RLS');
select pg_temp.denied('select public.set_partner_public_consent(true)', 'ordinary user cannot consent as partner');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert((public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->>'publicConsent')::boolean = false, 'no retrospective consent');
select pg_temp.assert(public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->>'intro' is null, 'intro hidden without consent');
select pg_temp.denied($q$select public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000002')$q$, 'unrelated partner denied');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select public.set_partner_public_consent(true);
select pg_temp.assert((select consented_at is not null and consent_version = '2026-10-04' from public.partner_public_profiles), 'consent timestamp and version');
select pg_temp.denied($q$update public.partner_work_histories set status='VERIFIED'$q$, 'partner self verification denied');
select pg_temp.denied($q$insert into public.partner_work_histories(partner_id,hospital,period,department,duties,status) values(auth.uid(),'Fake','Fake','Fake','Fake','VERIFIED')$q$, 'forged verified insert denied');
select pg_temp.denied($q$select public.admin_review_work_history('00000173-0000-4000-8000-000000000006','PENDING','VERIFIED','Test proof checked')$q$, 'partner cannot review');
select public.submit_partner_work_history('Second Hospital', '2025~2026', 'Outpatient', 'Actual work');
select pg_temp.assert((select count(*) = 2 from public.partner_work_histories), 'actual history registration');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert(public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->>'intro' = 'Actual introduction', 'actual intro visible with consent');
select pg_temp.assert(jsonb_array_length(public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->'workHistory') = 0, 'pending histories hidden');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_review_work_history('00000173-0000-4000-8000-000000000006','PENDING','VERIFIED','Test proof checked')$q$, 'admin without MFA denied');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select public.admin_review_work_history('00000173-0000-4000-8000-000000000006', 'PENDING', 'VERIFIED', 'Test proof checked');
select pg_temp.assert((select status = 'VERIFIED' from public.partner_work_histories where id = '00000173-0000-4000-8000-000000000006'), 'reviewer MFA verification');
reset role;
select pg_temp.assert(exists(select 1 from public.access_logs where action = 'WORK_HISTORY_REVIEW' and target_id = '00000173-0000-4000-8000-000000000006'), 'review audit log');
select pg_temp.assert(exists(select 1 from public.notifications where recipient_id = '00000173-0000-4000-8000-000000000003' and type = 'WORK_HISTORY_REVIEW'), 'review notification');
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert(jsonb_array_length(public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->'workHistory') = 1, 'only verified history visible');
select pg_temp.assert((public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->>'rating')::numeric = 4 and (public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->>'reviewCount')::integer = 1, 'actual rating and review count');
select pg_temp.assert(public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->'reviews' = '[]'::jsonb, 'review without actual recipient consent is hidden');
select pg_temp.assert((select array_agg(k order by k) from jsonb_object_keys(public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')) k) = array['intro','name','partnerId','publicConsent','qualifications','rating','reviewCount','reviews','workHistory'], 'detail field allowlist');
select pg_temp.assert((select status = 'MATCHING' and confirmed_partner_id is null and payment_deadline is null from public.reservations where id = '00000173-0000-4000-8000-000000000005'), 'detail does not select or confirm');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select public.set_partner_public_consent(false);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000173-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert(jsonb_array_length(public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')->'workHistory') = 0, 'withdrawal hides verified history');
reset role;
update public.reservation_applications set status = 'REJECTED' where reservation_id = '00000173-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.denied($q$select public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')$q$, 'rejected application denied');
reset role;
update public.reservation_applications set status = 'ACCEPTED' where reservation_id = '00000173-0000-4000-8000-000000000005';
update public.reservations set status = 'CANCELLED' where id = '00000173-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.denied($q$select public.get_reservation_partner_detail('00000173-0000-4000-8000-000000000005','00000173-0000-4000-8000-000000000003')$q$, 'closed reservation denied');
reset role;
delete from public.partner_accounts where profile_id = '00000173-0000-4000-8000-000000000003';
select pg_temp.assert(not exists(select 1 from public.partner_work_histories where partner_id = '00000173-0000-4000-8000-000000000003') and not exists(select 1 from public.partner_public_profiles where partner_id = '00000173-0000-4000-8000-000000000003'), 'partner account deletion purges extra profile');
rollback;

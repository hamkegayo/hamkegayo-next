-- #226 integration test. Transaction-local fixtures; always rolled back.
begin;
update public.partner_public_release set enabled=true;
update public.partner_activity_release set enabled=false;
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
create function pg_temp.invalid(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when invalid_parameter_value then
    raise notice 'PASS: %', p_label;
    return;
  end;
  raise exception 'FAIL: %', p_label;
end;
$$;
grant execute on function pg_temp.assert(boolean,text), pg_temp.denied(text,text), pg_temp.invalid(text,text) to anon, authenticated;
insert into auth.users(id, email, raw_app_meta_data) values
('00000226-0000-4000-8000-000000000001', 'activity-owner@example.invalid', '{}'),
('00000226-0000-4000-8000-000000000003', 'activity-partner@example.invalid', '{}'),
('00000226-0000-4000-8000-000000000004', 'activity-other@example.invalid', '{}');
insert into public.profiles(id, name, role) values
('00000226-0000-4000-8000-000000000001', 'Activity Owner', 'USER'),
('00000226-0000-4000-8000-000000000003', 'Activity Partner', 'PARTNER'),
('00000226-0000-4000-8000-000000000004', 'Activity Other', 'PARTNER');
insert into public.partner_accounts(profile_id, login_id, intro) values
('00000226-0000-4000-8000-000000000003', 'activity-test-226', 'Activity intro'),
('00000226-0000-4000-8000-000000000004', 'activity-other-226', 'Other intro');
insert into public.reservations(id, code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone, guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address, hospital_address)
values ('00000226-0000-4000-8000-000000000005', 'TEST-ACTIVITY-226', '00000226-0000-4000-8000-000000000001', 'basic', 'Test', '1960-01-01', 'female', '01000000000', 'Test', '01000000000', 'self', 'Test', 'Test', '2099-01-01', '09:00', '09:00', '2시간', 120, 'Test', 'Test');
insert into public.reservation_applications(reservation_id, partner_id, status) values
('00000226-0000-4000-8000-000000000005', '00000226-0000-4000-8000-000000000003', 'ACCEPTED');

select pg_temp.assert((select count(*) = 246 from public.partner_activity_regions), 'region list size (17 sido + 229 sigungu)');
select pg_temp.assert((select count(*) = 17 from public.partner_activity_regions where sigungu is null), 'sido rows');
select pg_temp.assert(not exists(select 1 from public.partner_activity_regions where sido = '경상북도' and sigungu = '군위군'), 'gunwi moved to daegu');

set local role anon;
select pg_temp.denied('select count(*) from public.partner_activity_regions', 'anonymous region list denied');
select pg_temp.denied($q$select public.save_partner_activity_profile('{}',null,null,null,null,null,null,'{}','{}','{}')$q$, 'anonymous save denied');
reset role;

-- 일반 회원은 파트너 활동 정보를 저장할 수 없다.
select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.denied($q$select public.save_partner_activity_profile('{}',null,null,null,null,null,null,'{}','{}','{}')$q$, 'ordinary user cannot save activity');
select pg_temp.denied('update public.partner_activity_release set enabled=true', 'customer cannot enable activity release');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.denied($q$insert into public.partner_activity_profiles(partner_id) values (auth.uid())$q$, 'direct insert denied');
select pg_temp.invalid($q$select public.save_partner_activity_profile(array['서울특별시 없는구'],null,null,null,null,null,null,'{}','{}','{}')$q$, 'unknown region rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile(array['서울특별시','서울특별시'],null,null,null,null,null,null,'{}','{}','{}')$q$, 'duplicate region rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}','06:30','12:00',null,null,null,null,'{}','{}','{}')$q$, 'time before 07:00 rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}','09:00','19:30',null,null,null,null,'{}','{}','{}')$q$, 'time after 19:00 rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}','09:15','12:00',null,null,null,null,'{}','{}','{}')$q$, 'non 30-minute time rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}','12:00','09:00',null,null,null,null,'{}','{}','{}')$q$, 'reversed time rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}','09:00',null,null,null,null,null,'{}','{}','{}')$q$, 'half-open time rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}',null,null,null,null,null,null,array['CAR'],'{}','{}')$q$, 'partner driving rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}',null,null,null,null,null,null,'{}',array['날 수 있음'],'{}')$q$, 'unknown mobility rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}',null,null,null,null,null,null,'{}','{}',array['  '])$q$, 'blank hospital rejected');
select pg_temp.invalid($q$select public.save_partner_activity_profile('{}',null,null,null,null,null,null,'{}','{}',array_fill('병원'::text, array[11]) || array['a','b','c','d','e','f','g','h','i','j','k'])$q$, 'more than 10 hospitals rejected');
select public.save_partner_activity_profile(
  array['서울특별시 강남구','경기도 성남시'], '09:00', '15:00', '07:00', '12:00', null, null,
  array['PUBLIC','TAXI'], array['부축 필요','휠체어 이용'], array[' 서울아산병원 ','서울아산병원','삼성서울병원']);
select pg_temp.assert((select regions = array['서울특별시 강남구','경기도 성남시'] and weekday_start = '09:00' and holiday_start is null
  and preferred_hospitals = array['서울아산병원','삼성서울병원'] from public.partner_activity_profiles), 'own activity saved with trimmed unique hospitals');
select public.save_partner_activity_profile(array['부산광역시'], null, null, null, null, '10:00', '18:00', '{}', '{}', '{}');
select pg_temp.assert((select regions = array['부산광역시'] and weekday_start is null and holiday_end = '18:00' and transports = '{}' from public.partner_activity_profiles), 'save replaces previous activity');
select public.save_partner_activity_profile(
  array['서울특별시 강남구'], '09:00', '15:00', null, null, null, null,
  array['PUBLIC'], array['휠체어 이용'], array['서울아산병원']);
select public.set_partner_public_consent(true);
select pg_temp.assert((select consent_version = '2026-10-04' from public.partner_public_profiles), 'v1 consent before activity release');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.partner_activity_profiles), 'other partner activity hidden by RLS');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.partner_activity_profiles), 'customer cannot read activity table');
select pg_temp.assert(public.get_reservation_partner_detail('00000226-0000-4000-8000-000000000005','00000226-0000-4000-8000-000000000003')->'activity' = 'null'::jsonb, 'activity hidden before release');
select pg_temp.assert(public.get_reservation_partner_detail('00000226-0000-4000-8000-000000000005','00000226-0000-4000-8000-000000000003')->>'intro' = 'Activity intro', 'v1 consent keeps existing items');
reset role;

-- 공개 스위치를 켜도 v1 동의자의 활동 정보는 공개하지 않는다(제16조 ③).
update public.partner_activity_release set enabled=true;
set local role authenticated;
select pg_temp.assert(public.get_reservation_partner_detail('00000226-0000-4000-8000-000000000005','00000226-0000-4000-8000-000000000003')->'activity' = 'null'::jsonb, 'v1 consent does not expose activity');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select public.set_partner_public_consent(true);
select pg_temp.assert((select consent_version = '2026-10-06' from public.partner_public_profiles), 'reconsent records v2');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert((public.get_reservation_partner_detail('00000226-0000-4000-8000-000000000005','00000226-0000-4000-8000-000000000003')->>'publicConsent')::boolean, 'v2 consent counts as public consent');
select pg_temp.assert(public.get_reservation_partner_detail('00000226-0000-4000-8000-000000000005','00000226-0000-4000-8000-000000000003')->'activity' = jsonb_build_object(
  'regions', jsonb_build_array('서울특별시 강남구'),
  'times', jsonb_build_object('weekday', jsonb_build_array('09:00','15:00'), 'saturday', null, 'holiday', null),
  'transports', jsonb_build_array('PUBLIC'),
  'mobility', jsonb_build_array('휠체어 이용'),
  'hospitals', jsonb_build_array('서울아산병원')), 'v2 consent exposes activity');
select pg_temp.assert(not (public.get_reservation_partner_detail('00000226-0000-4000-8000-000000000005','00000226-0000-4000-8000-000000000003')::text ~ 'updated_at|partner_id'), 'activity field allowlist');
reset role;

update public.partner_activity_release set enabled=false;
set local role authenticated;
select pg_temp.assert(public.get_reservation_partner_detail('00000226-0000-4000-8000-000000000005','00000226-0000-4000-8000-000000000003')->'activity' = 'null'::jsonb, 'release off hides activity again');
reset role;

delete from public.partner_accounts where profile_id = '00000226-0000-4000-8000-000000000003';
select pg_temp.assert(not exists(select 1 from public.partner_activity_profiles where partner_id = '00000226-0000-4000-8000-000000000003'), 'partner account deletion purges activity');
rollback;

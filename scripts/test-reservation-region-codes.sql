-- #226 예약 주소 법정동코드 · #232 리뷰(코드 신뢰 경계·검색 호출 제한). Transaction-local fixtures; always rolled back.
begin;
create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end;
$$;
create function pg_temp.rejected(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when check_violation or invalid_parameter_value then
    raise notice 'PASS: %', p_label;
    return;
  end;
  raise exception 'FAIL: %', p_label;
end;
$$;
insert into auth.users(id, email, raw_app_meta_data) values
('00000226-0000-4000-8000-000000000101', 'region-code-owner@example.invalid', '{}');
insert into public.profiles(id, name, role) values
('00000226-0000-4000-8000-000000000101', 'Region Code Owner', 'USER');
insert into public.reservations(id, code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone, guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address, hospital_address, depart_region_code, hospital_region_code)
values ('00000226-0000-4000-8000-000000000102', 'TEST-REGION-226', '00000226-0000-4000-8000-000000000101', 'basic', 'Test', '1960-01-01', 'female', '01000000000', 'Test', '01000000000', 'self', 'Test', 'Test', '2099-01-01', '09:00', '09:00', '2시간', 120,
  '강원특별자치도 원주시 서원대로 33 101동', '서울특별시 송파구 올림픽로43길 88', '5113011000', '1171010300');

select pg_temp.assert((select depart_region_code = '5113011000' and hospital_region_code = '1171010300' from public.reservations where id = '00000226-0000-4000-8000-000000000102'), 'searched address codes stored');
select pg_temp.assert(public.partner_activity_region_covers(array['5113000000'], (select depart_region_code from public.reservations where id = '00000226-0000-4000-8000-000000000102')), 'stored depart code matches city selection');
select pg_temp.rejected($q$update public.reservations set depart_region_code = '51130' where id = '00000226-0000-4000-8000-000000000102'$q$, 'short code rejected');
select pg_temp.rejected($q$update public.reservations set hospital_region_code = 'abcdefghij' where id = '00000226-0000-4000-8000-000000000102'$q$, 'non-numeric code rejected');

-- #232 리뷰: 존재하지 않는 코드는 서비스 권한이어도 거부한다. 리 코드는 읍·면으로 올려 본다.
select pg_temp.rejected($q$update public.reservations set depart_region_code = '1100099999' where id = '00000226-0000-4000-8000-000000000102'$q$, 'nonexistent 10-digit code rejected');
update public.reservations set depart_region_code = '5113025021' where id = '00000226-0000-4000-8000-000000000102';
select pg_temp.assert((select depart_region_code = '5113025021' from public.reservations where id = '00000226-0000-4000-8000-000000000102'), 'ri-level code accepted via its eup');

-- #232 리뷰: 고객 권한으로는 코드를 쓸 수 없다(화면 우회로 다른 지역 코드를 넣지 못하게).
grant execute on function pg_temp.assert(boolean, text) to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000101","role":"authenticated"}', true);
set local role authenticated;
update public.reservations set depart_region_code = '1168000000', hospital_region_code = '1168000000' where id = '00000226-0000-4000-8000-000000000102';
reset role;
select pg_temp.assert((select depart_region_code = '5113025021' and hospital_region_code = '1171010300' from public.reservations where id = '00000226-0000-4000-8000-000000000102'), 'customer update cannot change region codes');
set local role authenticated;
insert into public.reservations(id, code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone, guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address, hospital_address, depart_region_code, hospital_region_code)
values ('00000226-0000-4000-8000-000000000103', 'TEST-REGION-226-B', '00000226-0000-4000-8000-000000000101', 'basic', 'Test', '1960-01-01', 'female', '01000000000', 'Test', '01000000000', 'self', 'Test', 'Test', '2099-01-01', '09:00', '09:00', '2시간', 120,
  '서울특별시 강남구 테헤란로 1', '서울특별시 강남구 테헤란로 1', '5113011000', '5113011000');
reset role;
select pg_temp.assert((select depart_region_code is null and hospital_region_code is null from public.reservations where id = '00000226-0000-4000-8000-000000000103'), 'customer insert cannot set region codes');

-- #232 리뷰: 주소 검색 호출 제한 — 사용자별 분당 20회
select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000101","role":"authenticated"}', true);
set local role authenticated;
create temp table quota as select public.consume_address_search_quota('ADDRESS') ok from generate_series(1, 21);
reset role;
select pg_temp.assert((select count(*) filter (where ok) = 20 and count(*) filter (where not ok) = 1 from quota), '21st search in a minute is limited');
select pg_temp.assert((select minute_count = 21 from public.address_search_usage where user_id = '00000226-0000-4000-8000-000000000101' and kind = 'ADDRESS'), 'usage counted');
update public.address_search_usage set minute_start = minute_start - interval '1 minute', day_count = 300 where user_id = '00000226-0000-4000-8000-000000000101';
set local role authenticated;
select pg_temp.assert(not public.consume_address_search_quota('ADDRESS'), 'daily limit of 300 applies after minute resets');
select pg_temp.assert(public.consume_address_search_quota('HOSPITAL'), 'hospital search has its own counter');
reset role;
set local role anon;
do $$ begin
  begin
    perform public.consume_address_search_quota('ADDRESS');
    raise exception 'FAIL: anonymous cannot call quota';
  exception when insufficient_privilege then raise notice 'PASS: anonymous cannot call quota';
  end;
end $$;
reset role;

-- 처리방침 제4조 3년 파기: 주소를 지우면서 파기 표시를 찍을 때 코드도 지운다.
update public.reservations set depart_address = null, hospital_address = null, personal_data_purged_at = now()
 where id = '00000226-0000-4000-8000-000000000102';
select pg_temp.assert((select depart_region_code is null and hospital_region_code is null from public.reservations where id = '00000226-0000-4000-8000-000000000102'), 'purge clears region codes');
rollback;

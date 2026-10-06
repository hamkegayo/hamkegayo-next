-- #226 수락 대기 요청 "내 조건에 맞음" 판정. Transaction-local fixtures; always rolled back.
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
grant execute on function pg_temp.assert(boolean,text), pg_temp.denied(text,text) to anon, authenticated;
insert into auth.users(id, email, raw_app_meta_data) values
('00000226-0000-4000-8000-000000000201', 'match-customer@example.invalid', '{}'),
('00000226-0000-4000-8000-000000000202', 'match-partner@example.invalid', '{"role":"PARTNER"}');
insert into public.profiles(id, name, role) values
('00000226-0000-4000-8000-000000000201', 'Match Customer', 'USER'),
('00000226-0000-4000-8000-000000000202', 'Match Partner', 'PARTNER');
insert into public.partner_accounts(profile_id, login_id) values
('00000226-0000-4000-8000-000000000202', 'match-test-226');

-- 1) 원주 단계동(코드 있음) → 송파 풍납동, 택시 왕복
-- 2) 코드 없는 직접 입력 "서울 중구 ..." → "서울 종로구 ...", 대중교통/택시
-- 3) 코드 없는 직접 입력 "부산 중구 ..." (서울 중구와 이름만 같음)
-- 4) 취소된 예약 — 판정 대상이 아니다
insert into public.reservations(id, code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone, guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address, hospital_address, depart_region_code, hospital_region_code, transport_to, transport_home, status)
values
('00000226-0000-4000-8000-000000000211', 'TEST-MATCH-1', '00000226-0000-4000-8000-000000000201', 'basic', 'T', '1960-01-01', 'female', '010', 'T', '010', 'self', 'T', 'T', '2099-01-01', '09:00', '09:00', '2시간', 120,
 '강원특별자치도 원주시 서원대로 33 (단계동) 101동', '서울특별시 송파구 올림픽로43길 88 (풍납동)', '5113011000', '1171010300', 'TAXI', 'TAXI', 'MATCHING'),
('00000226-0000-4000-8000-000000000212', 'TEST-MATCH-2', '00000226-0000-4000-8000-000000000201', 'basic', 'T', '1960-01-01', 'female', '010', 'T', '010', 'self', 'T', 'T', '2099-01-01', '09:00', '09:00', '2시간', 120,
 '서울 중구 세종대로 110', '서울 종로구 대학로 101', null, null, 'PUBLIC', 'TAXI', 'MATCHING'),
('00000226-0000-4000-8000-000000000213', 'TEST-MATCH-3', '00000226-0000-4000-8000-000000000201', 'basic', 'T', '1960-01-01', 'female', '010', 'T', '010', 'self', 'T', 'T', '2099-01-01', '09:00', '09:00', '2시간', 120,
 '부산 중구 중앙대로 1', '부산 중구 중앙대로 2', null, null, 'TAXI', 'TAXI', 'MATCHING'),
('00000226-0000-4000-8000-000000000215', 'TEST-MATCH-5', '00000226-0000-4000-8000-000000000201', 'basic', 'T', '1960-01-01', 'female', '010', 'T', '010', 'self', 'T', 'T', '2099-01-01', '09:00', '09:00', '2시간', 120,
 '강원특별자치도 원주시 단계동', '강원특별자치도 원주시 단계동', '5113011000', '5113011000', 'TAXI', null, 'MATCHING'),
('00000226-0000-4000-8000-000000000216', 'TEST-MATCH-6', '00000226-0000-4000-8000-000000000201', 'basic', 'T', '1960-01-01', 'female', '010', 'T', '010', 'self', 'T', 'T', '2099-01-01', '09:00', '09:00', '2시간', 120,
 '강원특별자치도 원주시 단계동', '강원특별자치도 원주시 단계동', '5113011000', '5113011000', null, null, 'MATCHING'),
('00000226-0000-4000-8000-000000000214', 'TEST-MATCH-4', '00000226-0000-4000-8000-000000000201', 'basic', 'T', '1960-01-01', 'female', '010', 'T', '010', 'self', 'T', 'T', '2099-01-01', '09:00', '09:00', '2시간', 120,
 '강원특별자치도 원주시 단계동', '강원특별자치도 원주시 단계동', '5113011000', '5113011000', 'TAXI', 'TAXI', 'CANCELLED');

create temp table ids as select array[
  '00000226-0000-4000-8000-000000000211','00000226-0000-4000-8000-000000000212',
  '00000226-0000-4000-8000-000000000213','00000226-0000-4000-8000-000000000214',
  '00000226-0000-4000-8000-000000000215','00000226-0000-4000-8000-000000000216']::uuid[] v;
grant select on ids to authenticated;

-- 주소 글자 보조 판정은 첫 토큰의 시·도와 토큰 단위 이름으로만 맞춘다 (#233 리뷰)
select pg_temp.assert(not public.partner_activity_address_matches(array['1100000000'], '경기도 김포시 서울로 1'), 'road name containing seoul does not match seoul');
select pg_temp.assert(not public.partner_activity_address_matches(array['1200000000'], '경기도 광주시 경안동 123'), 'gyeonggi gwangju-si does not match jeonnam-gwangju');
select pg_temp.assert(not public.partner_activity_address_matches(array['1200000000'], '광주시 경안동 123'), 'gwangju-si token is not the gwangju alias');
select pg_temp.assert(public.partner_activity_address_matches(array['1200000000'], '광주 북구 용봉로 77'), 'legacy gwangju address matches merged province');
select pg_temp.assert(public.partner_activity_address_matches(array['1100000000'], '서울 중구 세종대로 110'), 'seoul short alias at start matches');
select pg_temp.assert(not public.partner_activity_address_matches(array['1114000000'], '서울 종로구 중구청로 1'), 'jung-gu must be a whole token');
select pg_temp.assert(public.partner_activity_address_matches(array['5113011000'], '강원특별자치도 원주시 서원대로 33 (단계동)'), 'dong in parentheses is a token');
select pg_temp.assert(not public.partner_activity_address_matches(array['1100000000'], '강남구 테헤란로 1'), 'address without leading sido is not judged');

-- 일반 회원은 쓸 수 없다
select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000201","role":"authenticated","app_metadata":{"role":"USER"}}', true);
set local role authenticated;
select pg_temp.denied($q$select * from public.partner_open_reservation_matches((select v from ids))$q$, 'non-partner denied');
select pg_temp.denied($q$select public.partner_activity_address_matches(array['1100000000'], '서울')$q$, 'address helper not callable directly');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000202","role":"authenticated","app_metadata":{"role":"PARTNER"}}', true);
set local role authenticated;
-- 활동 정보 없음 → 판정 안 함(null)
select pg_temp.assert((select bool_and(region_match is null and transport_match is null) from public.partner_open_reservation_matches((select v from ids))), 'no activity means no judgement');
select pg_temp.assert((select count(*) = 5 from public.partner_open_reservation_matches((select v from ids))), 'cancelled reservation excluded');

-- 원주시 전체 + 서울 중구, 택시만 가능
select public.save_partner_activity_profile(array['5113000000','1114000000'], null, null, null, null, null, null, array['TAXI'], '{}', '{}');
create temp table m as select * from public.partner_open_reservation_matches((select v from ids));
select pg_temp.assert((select region_match and transport_match from m where reservation_id = '00000226-0000-4000-8000-000000000211'), 'coded depart in city matches; taxi both ways');
select pg_temp.assert((select region_match and not transport_match from m where reservation_id = '00000226-0000-4000-8000-000000000212'), 'uncoded seoul jung-gu matches by text; public transport not allowed');
select pg_temp.assert((select not region_match from m where reservation_id = '00000226-0000-4000-8000-000000000213'), 'busan jung-gu does not match seoul jung-gu');
select pg_temp.assert(not exists(select 1 from m where reservation_id = '00000226-0000-4000-8000-000000000214'), 'cancelled not judged');
-- 이동 조건 누락은 일치가 아니다 (#233 리뷰)
select pg_temp.assert((select transport_match = false from m where reservation_id = '00000226-0000-4000-8000-000000000215'), 'missing return transport is not a match');
select pg_temp.assert((select transport_match = false from m where reservation_id = '00000226-0000-4000-8000-000000000216'), 'missing both transports is not a match');

-- 병원 주소로만 맞아도 일치 (송파구)
select public.save_partner_activity_profile(array['1171000000'], null, null, null, null, null, null, '{}', '{}', '{}');
select pg_temp.assert((select region_match and transport_match is null from public.partner_open_reservation_matches((select v from ids)) where reservation_id = '00000226-0000-4000-8000-000000000211'), 'hospital address alone matches');

-- 결과에는 주소·코드가 없다 (처리방침 제5조 ③)
select pg_temp.assert((select array_agg(t.n order by t.n) = array['region_match','reservation_id','transport_match']
  from pg_proc p, unnest(p.proargnames, p.proargmodes) as t(n, m)
  where p.proname = 'partner_open_reservation_matches' and t.m = 't'), 'result has booleans only');
reset role;

-- 거절한 파트너에게는 판정하지 않는다 (제9조 ④)
insert into public.reservation_applications(reservation_id, partner_id, status) values
('00000226-0000-4000-8000-000000000211', '00000226-0000-4000-8000-000000000202', 'REJECTED');
set local role authenticated;
select pg_temp.assert(not exists(select 1 from public.partner_open_reservation_matches((select v from ids)) where reservation_id = '00000226-0000-4000-8000-000000000211'), 'rejected partner excluded');
reset role;
rollback;

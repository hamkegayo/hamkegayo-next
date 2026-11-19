-- #285: 거동·인지 상태 매칭 전 파트너 제공 별도 동의 · 미동의 노출 차단 · 불변성 검증
-- 트랜잭션 안의 전용 fixture만 사용하고 모두 롤백한다.
begin;

create function pg_temp.assert(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'PASS: %', label;
end $$;

create function pg_temp.expect_sqlstate(sql text, expected_state text, label text) returns void
language plpgsql as $$
declare
  v_state text;
begin
  begin
    execute sql;
  exception when others then
    v_state := sqlstate;
    if v_state = expected_state then
      raise notice 'PASS: % (sqlstate=%)', label, v_state;
      return;
    end if;
    raise exception 'FAIL: % — expected %, got % (%)', label, expected_state, v_state, sqlerrm;
  end;
  raise exception 'FAIL: % — expected %, but succeeded', label, expected_state;
end $$;

grant execute on function pg_temp.assert(boolean, text), pg_temp.expect_sqlstate(text, text, text) to anon, authenticated;

-- 전용 fixture 계정
insert into auth.users (id, email) values
  ('00000285-0000-4000-8000-000000000001', 'customer-285@example.invalid'),
  ('00000285-0000-4000-8000-000000000002', 'partner-285@example.invalid');

insert into public.profiles (id, name, role, status) values
  ('00000285-0000-4000-8000-000000000001', 'Customer 285', 'USER', 'ACTIVE'),
  ('00000285-0000-4000-8000-000000000002', 'Partner 285', 'PARTNER', 'ACTIVE');

insert into public.partner_accounts (profile_id, login_id) values
  ('00000285-0000-4000-8000-000000000002', 'partner-285');

-- 1) 동의 없는 예약 / 동의 있는 예약 시드 (service/postgres 권한)
insert into public.reservations (
  id, code, customer_id, plan,
  patient_name, patient_birth, patient_gender, patient_phone,
  guardian_name, guardian_phone, relation,
  treatment, purpose,
  use_date, arrive_time, reserve_time, duration, duration_minutes,
  depart_address, hospital_name, hospital_address,
  mobility_status, cognitive_status,
  pre_matching_health_consented_at, pre_matching_health_consent_version
) values
  (
    '00000285-0000-4000-8000-000000000011', 'TEST-285-NOCONSENT',
    '00000285-0000-4000-8000-000000000001', 'basic',
    '미동의환자', '1950-01-01', 'female', '01011112222',
    '보호자', '01033334444', '자녀',
    '내과', '정기검진',
    '2026-12-20', '09:00', '10:00', '2시간', 120,
    '서울특별시 강남구 역삼동 1-1', '테스트병원', '서울특별시 서초구 반포대로 58',
    '부축 필요', '의사소통 원활',
    null, null
  ),
  (
    '00000285-0000-4000-8000-000000000012', 'TEST-285-CONSENTED',
    '00000285-0000-4000-8000-000000000001', 'basic',
    '동의환자', '1952-03-04', 'male', '01055556666',
    '보호자', '01077778888', '자녀',
    '정형외과', '외래진료',
    '2026-12-21', '09:00', '10:00', '2시간', 120,
    '서울특별시 강남구 역삼동 2-2', '테스트병원2', '서울특별시 서초구 반포대로 58',
    '자력 보행', '의사소통 원활',
    now(), '2026-09-06'
  );

-- =============================================================
-- Test Case 3: 파트너 단계 1 RPC 노출 게이트 검증
-- =============================================================
select set_config(
  'request.jwt.claims',
  '{"sub":"00000285-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"PARTNER"}}',
  true
);
set local role authenticated;

select pg_temp.assert(
  (
    select mobility_status is null and cognitive_status is null
      from public.partner_list_open_reservations(100, 0)
     where id = '00000285-0000-4000-8000-000000000011'
  ),
  '미동의 예약은 partner_list_open_reservations에서 거동·인지 상태가 null'
);

select pg_temp.assert(
  (
    select mobility_status is null and cognitive_status is null
      from public.partner_get_open_reservation('00000285-0000-4000-8000-000000000011')
  ),
  '미동의 예약은 partner_get_open_reservation에서 거동·인지 상태가 null'
);

select pg_temp.assert(
  (
    select mobility_status = '자력 보행' and cognitive_status = '의사소통 원활'
      from public.partner_list_open_reservations(100, 0)
     where id = '00000285-0000-4000-8000-000000000012'
  ),
  '동의 예약은 partner_list_open_reservations에서 거동·인지 상태가 반환됨'
);

select pg_temp.assert(
  (
    select mobility_status = '자력 보행' and cognitive_status = '의사소통 원활'
      from public.partner_get_open_reservation('00000285-0000-4000-8000-000000000012')
  ),
  '동의 예약은 partner_get_open_reservation에서 거동·인지 상태가 반환됨'
);

select pg_temp.assert(
  pg_get_function_result('public.partner_open_reservation_matches(uuid[])'::regprocedure)
    = 'TABLE(reservation_id uuid, region_match boolean, transport_match boolean)',
  'partner_open_reservation_matches는 reservation_id, region_match, transport_match만 반환'
);

select pg_temp.assert(
  (
    select count(*) = 2
      from public.partner_open_reservation_matches(array[
        '00000285-0000-4000-8000-000000000011'::uuid,
        '00000285-0000-4000-8000-000000000012'::uuid
      ])
  ),
  'partner_open_reservation_matches 정상 동작'
);

reset role;

-- =============================================================
-- Test Case 4: 고객 권한 동의 기록 불변성 · 부분 동의 차단 · 서버 시각 강제
-- =============================================================
select set_config(
  'request.jwt.claims',
  '{"sub":"00000285-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.expect_sqlstate(
  $q$update public.reservations
         set pre_matching_health_consented_at = now()
       where id = '00000285-0000-4000-8000-000000000011'$q$,
  '42501',
  '고객은 pre_matching_health_consented_at을 UPDATE할 수 없음 (42501)'
);

select pg_temp.expect_sqlstate(
  $q$update public.reservations
         set pre_matching_health_consent_version = '2026-09-06'
       where id = '00000285-0000-4000-8000-000000000011'$q$,
  '42501',
  '고객은 pre_matching_health_consent_version을 UPDATE할 수 없음 (42501)'
);

select pg_temp.expect_sqlstate(
  $q$insert into public.reservations (
       id, code, customer_id, plan,
       patient_name, patient_birth, patient_gender, patient_phone,
       guardian_name, guardian_phone, relation,
       treatment, purpose,
       use_date, arrive_time, reserve_time, duration, duration_minutes,
       depart_address, hospital_name, hospital_address,
       mobility_status, cognitive_status,
       pre_matching_health_consented_at, pre_matching_health_consent_version
     ) values (
       '00000285-0000-4000-8000-000000000013', 'TEST-285-PARTIAL1',
       '00000285-0000-4000-8000-000000000001', 'basic',
       '부분동의1', '1950-01-01', 'female', '01011112222',
       '보호자', '01033334444', '자녀',
       '내과', '검진',
       '2026-12-22', '09:00', '10:00', '2시간', 120,
       '서울특별시 강남구 역삼동', '병원', '서울특별시 서초구',
       '자력 보행', '의사소통 원활',
       now(), null
     )$q$,
  '23514',
  '버전 없는 부분 동의 INSERT는 체크 제약으로 거부됨 (23514)'
);

select pg_temp.expect_sqlstate(
  $q$insert into public.reservations (
       id, code, customer_id, plan,
       patient_name, patient_birth, patient_gender, patient_phone,
       guardian_name, guardian_phone, relation,
       treatment, purpose,
       use_date, arrive_time, reserve_time, duration, duration_minutes,
       depart_address, hospital_name, hospital_address,
       mobility_status, cognitive_status,
       pre_matching_health_consented_at, pre_matching_health_consent_version
     ) values (
       '00000285-0000-4000-8000-000000000014', 'TEST-285-BLANKVER',
       '00000285-0000-4000-8000-000000000001', 'basic',
       '공백버전', '1950-01-01', 'female', '01011112222',
       '보호자', '01033334444', '자녀',
       '내과', '검진',
       '2026-12-22', '09:00', '10:00', '2시간', 120,
       '서울특별시 강남구 역삼동', '병원', '서울특별시 서초구',
       '자력 보행', '의사소통 원활',
       now(), '   '
     )$q$,
  '23514',
  '공백 버전 동의 INSERT는 체크 제약으로 거부됨 (23514)'
);

select pg_temp.expect_sqlstate(
  $q$insert into public.reservations (
       id, code, customer_id, plan,
       patient_name, patient_birth, patient_gender, patient_phone,
       guardian_name, guardian_phone, relation,
       treatment, purpose,
       use_date, arrive_time, reserve_time, duration, duration_minutes,
       depart_address, hospital_name, hospital_address,
       mobility_status, cognitive_status,
       pre_matching_health_consented_at, pre_matching_health_consent_version
     ) values (
       '00000285-0000-4000-8000-000000000016', 'TEST-285-BADFORMAT',
       '00000285-0000-4000-8000-000000000001', 'basic',
       '잘못된버전', '1950-01-01', 'female', '01011112222',
       '보호자', '01033334444', '자녀',
       '내과', '검진',
       '2026-12-22', '09:00', '10:00', '2시간', 120,
       '서울특별시 강남구 역삼동', '병원', '서울특별시 서초구',
       '자력 보행', '의사소통 원활',
       now(), 'invalid-version'
     )$q$,
  '23514',
  '날짜 형식(YYYY-MM-DD)이 아닌 버전 동의 INSERT는 체크 제약으로 거부됨 (23514)'
);

-- 고객 INSERT 시 클라이언트 시각('2000-01-01T00:00:00Z')을 넘겨도 서버 now()로 강제됨
insert into public.reservations (
  id, code, customer_id, plan,
  patient_name, patient_birth, patient_gender, patient_phone,
  guardian_name, guardian_phone, relation,
  treatment, purpose,
  use_date, arrive_time, reserve_time, duration, duration_minutes,
  depart_address, hospital_name, hospital_address,
  mobility_status, cognitive_status,
  pre_matching_health_consented_at, pre_matching_health_consent_version
) values (
  '00000285-0000-4000-8000-000000000015', 'TEST-285-FORGETIME',
  '00000285-0000-4000-8000-000000000001', 'basic',
  '시각위조테스트', '1950-01-01', 'female', '01011112222',
  '보호자', '01033334444', '자녀',
  '내과', '검진',
  '2026-12-22', '09:00', '10:00', '2시간', 120,
  '서울특별시 강남구 역삼동', '병원', '서울특별시 서초구',
  '자력 보행', '의사소통 원활',
  '2000-01-01T00:00:00Z'::timestamptz, '2026-09-06'
);

select pg_temp.assert(
  (
    select pre_matching_health_consented_at = now()
       and pre_matching_health_consented_at > '2000-01-01T00:00:00Z'::timestamptz
      from public.reservations
     where id = '00000285-0000-4000-8000-000000000015'
  ),
  '고객 INSERT 시 pre_matching_health_consented_at은 서버 now()로 강제됨'
);

reset role;
rollback;

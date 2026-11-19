-- #306: 대리 예약 이용자 본인 동의·대리 동의 사유·권한 확인 / 불변성 / 매칭 차단 / 토큰 검증 테스트
-- 처리방침 제10조 ①-④. 트랜잭션 안의 전용 fixture만 사용하고 모두 롤백한다.
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

-- 예약 INSERT 헬퍼 (호출한 역할 권한으로 실행되어 트리거가 그대로 적용된다)
create function pg_temp.ins(
  p_id uuid, p_code text, p_relation text, p_mode text, p_status text,
  p_reason_code text default null, p_reason_detail text default null,
  p_share boolean default false, p_requested timestamptz default null,
  p_confirmed timestamptz default null, p_authority_version text default null,
  p_health_at timestamptz default null, p_health_version text default null
) returns void
language plpgsql as $$
begin
  insert into public.reservations (
    id, code, customer_id, plan,
    patient_name, patient_birth, patient_gender, patient_phone,
    guardian_name, guardian_phone, relation,
    treatment, purpose,
    use_date, arrive_time, reserve_time, duration, duration_minutes,
    depart_address, hospital_name, hospital_address,
    mobility_status, cognitive_status, share_medical_info,
    pre_matching_health_consented_at, pre_matching_health_consent_version,
    user_consent_mode, user_consent_status,
    user_consent_requested_at, user_consent_confirmed_at,
    proxy_reason_code, proxy_reason_detail, proxy_authority_version
  ) values (
    p_id, p_code, '00000306-0000-4000-8000-000000000001', 'basic',
    '이용자306', '1950-01-01', 'female', '010-1111-2222',
    '보호자', '010-3333-4444', p_relation,
    '내과', '정기검진',
    '2026-12-30', '09:00', '10:00', '2시간', 120,
    '서울특별시 강남구 역삼동 1-1', '테스트병원', '서울특별시 서초구 반포대로 58',
    '부축 필요', '의사소통 원활', p_share,
    p_health_at, p_health_version,
    p_mode, p_status,
    p_requested, p_confirmed,
    p_reason_code, p_reason_detail, p_authority_version
  );
end $$;

grant execute on function
  pg_temp.assert(boolean, text),
  pg_temp.expect_sqlstate(text, text, text),
  pg_temp.ins(uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz, text, timestamptz, text)
to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000306-0000-4000-8000-000000000001', 'customer-306@example.invalid'),
  ('00000306-0000-4000-8000-000000000002', 'partner-306@example.invalid'),
  ('00000306-0000-4000-8000-000000000003', 'other-306@example.invalid');

insert into public.profiles (id, name, role, status) values
  ('00000306-0000-4000-8000-000000000001', 'Customer 306', 'USER', 'ACTIVE'),
  ('00000306-0000-4000-8000-000000000002', 'Partner 306', 'PARTNER', 'ACTIVE'),
  ('00000306-0000-4000-8000-000000000003', 'Other 306', 'USER', 'ACTIVE');

insert into public.partner_accounts (profile_id, login_id) values
  ('00000306-0000-4000-8000-000000000002', 'partner-306');

-- =============================================================
-- Case 1: 체크 제약 정합성 (postgres 권한 시드)
-- =============================================================
select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000a1', 'T306-BADSELF', '본인', 'SELF', 'PENDING_USER')$q$,
  '23514', 'SELF 인데 PENDING_USER 상태는 체크 제약 거부');

select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000a2', 'T306-BADPROXY', '자녀', 'GUARDIAN_PROXY', 'CONFIRMED',
       'LACKS_CAPACITY', '짧음', false, null, now(), '2026-09-06')$q$,
  '23514', '대리 사유 상세 10자 미만은 체크 제약 거부');

select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000a3', 'T306-BADCODE', '자녀', 'GUARDIAN_PROXY', 'CONFIRMED',
       'WHATEVER', '충분히 긴 대리 사유 상세 설명', false, null, now(), '2026-09-06')$q$,
  '23514', '허용되지 않은 대리 사유 코드는 체크 제약 거부');

select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000a4', 'T306-NOVER', '자녀', 'GUARDIAN_PROXY', 'CONFIRMED',
       'LACKS_CAPACITY', '충분히 긴 대리 사유 상세 설명', false, null, now(), null)$q$,
  '23514', '대리 권한 확인 버전 없는 대리 동의는 체크 제약 거부');

-- =============================================================
-- Case 2: 고객(authenticated) INSERT 위조 차단 · 서버 시각 강제
-- =============================================================
select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000b1', 'T306-SELF-PROXYREL', '자녀', 'SELF', 'NOT_REQUIRED')$q$,
  '23514', '본인이 아닌 관계를 SELF 로 등록할 수 없음');

select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000b2', 'T306-DIRECT-SELFREL', '본인', 'USER_DIRECT', 'PENDING_USER')$q$,
  '23514', '본인 관계에는 대리 동의 모드를 쓸 수 없음');

select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000b3', 'T306-FORGE-CONFIRMED', '자녀', 'USER_DIRECT', 'CONFIRMED',
       null, null, false, now(), now())$q$,
  '42501', '고객이 본인 동의 완료(CONFIRMED) 상태로 위조 INSERT 불가');

select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000b4', 'T306-FORGE-HEALTH', '자녀', 'USER_DIRECT', 'PENDING_USER',
       null, null, false, null, null, null, now(), '2026-09-06')$q$,
  '42501', '본인 동의 대기 중 거동·인지 동의 시각을 미리 채워 INSERT 불가');

select pg_temp.expect_sqlstate(
  $q$select pg_temp.ins('00000306-0000-4000-8000-0000000000b5', 'T306-FORGE-SHARE', '자녀', 'USER_DIRECT', 'PENDING_USER',
       null, null, true)$q$,
  '42501', '본인 동의 대기 중 share_medical_info=true INSERT 불가 (제10조 ④)');

-- 정상: 이용자 본인 직접 동의 대기 (클라이언트 시각 위조는 서버 시각으로 덮어씀)
select pg_temp.ins('00000306-0000-4000-8000-0000000000c1', 'T306-DIRECT', '자녀', 'USER_DIRECT', 'PENDING_USER',
  null, null, false, '2000-01-01T00:00:00Z');
select pg_temp.assert(
  (select user_consent_requested_at = now() and user_consent_confirmed_at is null
          and pre_matching_health_consented_at is null and share_medical_info = false
     from public.reservations where id = '00000306-0000-4000-8000-0000000000c1'),
  '본인 동의 요청 시각은 서버 now() 로 강제되고 확정·민감정보 동의는 비어 있음');

-- 정상: 보호자 대리 동의 (사유·서약 필수, 시각 서버 강제, share 고정 false)
select pg_temp.ins('00000306-0000-4000-8000-0000000000c2', 'T306-PROXY', '자녀', 'GUARDIAN_PROXY', 'CONFIRMED',
  'LACKS_CAPACITY', '치매로 의사능력이 제한되어 직접 동의가 어렵습니다.', true,
  null, '2000-01-01T00:00:00Z', '2026-09-06', '2000-01-01T00:00:00Z', '2026-09-06');
select pg_temp.assert(
  (select user_consent_confirmed_at = now() and proxy_authority_confirmed_at = now()
          and share_medical_info = false
     from public.reservations where id = '00000306-0000-4000-8000-0000000000c2'),
  '대리 동의 확정·권한 확인 시각은 서버 now() 로 강제되고 share_medical_info 는 false 로 고정');

-- 본인 예약
select pg_temp.ins('00000306-0000-4000-8000-0000000000c3', 'T306-SELFRES', '본인', 'SELF', 'NOT_REQUIRED');
select pg_temp.assert(
  (select user_consent_status = 'NOT_REQUIRED' from public.reservations
    where id = '00000306-0000-4000-8000-0000000000c3'),
  '본인 예약은 기존 흐름 그대로 NOT_REQUIRED');

-- 사후 변경 불가
select pg_temp.expect_sqlstate(
  $q$update public.reservations set user_consent_status = 'CONFIRMED', user_consent_confirmed_at = now()
      where id = '00000306-0000-4000-8000-0000000000c1'$q$,
  '42501', '고객이 본인 동의 상태를 직접 CONFIRMED 로 UPDATE 불가');
select pg_temp.expect_sqlstate(
  $q$update public.reservations set user_consent_channel = 'SMS'
      where id = '00000306-0000-4000-8000-0000000000c1'$q$,
  '42501', '고객이 동의 확정 링크 전달 방식을 UPDATE 불가');
select pg_temp.expect_sqlstate(
  $q$update public.reservations set user_consent_mode = 'GUARDIAN_PROXY'
      where id = '00000306-0000-4000-8000-0000000000c1'$q$,
  '42501', '고객이 동의 모드를 사후 변경 불가');
select pg_temp.expect_sqlstate(
  $q$update public.reservations set proxy_reason_detail = '사후 수정한 사유입니다 충분히 길게'
      where id = '00000306-0000-4000-8000-0000000000c2'$q$,
  '42501', '고객이 대리 사유를 사후 변경 불가');
select pg_temp.expect_sqlstate(
  $q$update public.reservations set proxy_authority_confirmed_at = now() + interval '1 day'
      where id = '00000306-0000-4000-8000-0000000000c2'$q$,
  '42501', '고객이 대리 권한 확인 시각을 사후 변경 불가');
select pg_temp.expect_sqlstate(
  $q$update public.reservations set share_medical_info = true
      where id = '00000306-0000-4000-8000-0000000000c1'$q$,
  '42501', '본인 동의 대기 중 고객이 share_medical_info 를 켤 수 없음 (제10조 ④)');

-- 토큰 테이블 직접 접근 불가
select pg_temp.expect_sqlstate(
  $q$select * from public.reservation_consent_tokens$q$,
  '42501', '고객은 토큰 테이블을 직접 조회할 수 없음');

reset role;

-- =============================================================
-- Case 3: 본인 동의 대기 중 파트너 노출·지원·확정·결제 차단
-- =============================================================
select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"PARTNER"}}', true);
set local role authenticated;

select pg_temp.assert(
  (select count(*) = 0 from public.partner_list_open_reservations(200, 0)
    where id = '00000306-0000-4000-8000-0000000000c1'),
  '본인 동의 대기 예약은 파트너 목록에 없음');
select pg_temp.expect_sqlstate(
  $q$select * from public.partner_get_open_reservation('00000306-0000-4000-8000-0000000000c1')$q$,
  '42501', '본인 동의 대기 예약 상세는 파트너에게 거절됨');
select pg_temp.assert(
  (select count(*) = 0 from public.partner_open_reservation_matches(
     array['00000306-0000-4000-8000-0000000000c1'::uuid])),
  '본인 동의 대기 예약은 일치 여부 RPC 에도 없음');
select pg_temp.assert(
  (select count(*) = 1 from public.partner_list_open_reservations(200, 0)
    where id = '00000306-0000-4000-8000-0000000000c3'),
  '본인(SELF) 예약은 기존처럼 파트너 목록에 노출됨');
select pg_temp.assert(
  (select count(*) = 1 from public.partner_list_open_reservations(200, 0)
    where id = '00000306-0000-4000-8000-0000000000c2'),
  '보호자 대리 동의 완료 예약은 파트너 목록에 노출됨');
select pg_temp.expect_sqlstate(
  $q$insert into public.reservation_applications (reservation_id, partner_id, status)
     values ('00000306-0000-4000-8000-0000000000c1', '00000306-0000-4000-8000-000000000002', 'ACCEPTED')$q$,
  'P0001', '본인 동의 대기 예약에 파트너 지원 불가');

reset role;

select pg_temp.expect_sqlstate(
  $q$update public.reservations set confirmed_partner_id = '00000306-0000-4000-8000-000000000002'
      where id = '00000306-0000-4000-8000-0000000000c1'$q$,
  'P0001', '본인 동의 대기 예약은 파트너 확정 불가');
select pg_temp.expect_sqlstate(
  $q$update public.reservations set status = 'CONFIRMED'
      where id = '00000306-0000-4000-8000-0000000000c1'$q$,
  'P0001', '본인 동의 대기 예약은 CONFIRMED 전이 불가');
select pg_temp.expect_sqlstate(
  $q$update public.reservations set paid_at = now()
      where id = '00000306-0000-4000-8000-0000000000c1'$q$,
  'P0001', '본인 동의 대기 예약은 결제 완료 기록 불가');

-- =============================================================
-- Case 4: 토큰 발급·검증·제출
-- =============================================================
-- 다른 고객은 발급 불가
select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_sqlstate(
  format($q$select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000c1', %L, 'MANUAL_LINK')$q$,
    encode(sha256('tok-x'::bytea), 'hex')),
  '42501', '다른 고객은 본인 동의 토큰을 발급할 수 없음');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select pg_temp.expect_sqlstate(
  $q$select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000c1', 'not-a-hash', 'MANUAL_LINK')$q$,
  '22023', '해시 형식이 아닌 토큰은 거부');
select pg_temp.expect_sqlstate(
  format($q$select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000c2', %L, 'MANUAL_LINK')$q$,
    encode(sha256('tok-y'::bytea), 'hex')),
  'P0001', '대리 동의(확정) 예약에는 본인 동의 토큰 발급 불가');

select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000c1',
  encode(sha256('tok-1'::bytea), 'hex'), 'MANUAL_LINK');
reset role;

select pg_temp.assert(
  (select expires_at <= now() + interval '24 hours' and expires_at > now() + interval '23 hours'
     from public.reservation_consent_tokens where token_hash = encode(sha256('tok-1'::bytea), 'hex')),
  '토큰 유효기간은 24시간(서비스 시작 전이면 그 이전)');
select pg_temp.assert(
  (select position('tok-1' in token_hash) = 0 and length(token_hash) = 64
     from public.reservation_consent_tokens limit 1),
  '토큰 원문이 아닌 해시만 저장');

-- 재발급 → 이전 토큰 폐기
select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000c1',
  encode(sha256('tok-2'::bytea), 'hex'), 'MANUAL_LINK');
reset role;

set local role service_role;
select pg_temp.assert(
  public.get_user_consent_token_state(encode(sha256('tok-1'::bytea), 'hex')) = 'REVOKED',
  '재발급하면 이전 토큰은 REVOKED');
select pg_temp.assert(
  public.get_user_consent_token_state(encode(sha256('tok-2'::bytea), 'hex')) = 'VALID',
  '새 토큰은 VALID');
select pg_temp.assert(
  public.get_user_consent_token_state(encode(sha256('nope'::bytea), 'hex')) = 'NOT_FOUND',
  '모르는 토큰은 NOT_FOUND');

-- 본인 확인 실패 → 정보 미노출, 시도 횟수 감소
select pg_temp.assert(
  (select result = 'MISMATCH' and attempts_left = 4 and plan is null and hospital_name is null
     from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1950-01-02', '2222')),
  '생년월일이 틀리면 MISMATCH 이고 예약 정보를 주지 않음');
select pg_temp.assert(
  (select result = 'MISMATCH' and attempts_left = 3
     from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1950-01-01', '9999')),
  '연락처 끝 4자리가 틀리면 MISMATCH');

-- 본인 확인 성공 → 최소 정보만
select pg_temp.assert(
  (select result = 'OK' and hospital_name = '테스트병원' and guardian_name = '보호자'
     from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1950-01-01', '2222')),
  '본인 확인 성공 시 최소 예약 정보 반환');
select pg_temp.assert(
  pg_get_function_result('public.verify_user_consent_identity(text, date, text)'::regprocedure)
    not like '%depart_address%'
  and pg_get_function_result('public.verify_user_consent_identity(text, date, text)'::regprocedure)
    not like '%mobility%',
  '본인 확인 응답에는 주소·거동 상태 컬럼이 없음');

-- 동의 없이 제출 → 토큰 소모 안 함
select pg_temp.assert(
  (select result = 'HEALTH_CONSENT_REQUIRED'
     from public.submit_user_consent(encode(sha256('tok-2'::bytea), 'hex'), '1950-01-01', '2222', false, true, '2026-09-06')),
  '거동·인지 상태 제공에 동의하지 않으면 제출 거부');
select pg_temp.assert(
  public.get_user_consent_token_state(encode(sha256('tok-2'::bytea), 'hex')) = 'VALID',
  '거부된 제출은 토큰을 소모하지 않음');

-- 5회 실패 → 잠금
select count(*) from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1999-01-01', '0000');
select count(*) from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1999-01-01', '0000');
select count(*) from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1999-01-01', '0000');
select count(*) from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1999-01-01', '0000');
select count(*) from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1999-01-01', '0000');
select pg_temp.assert(
  public.get_user_consent_token_state(encode(sha256('tok-2'::bytea), 'hex')) = 'LOCKED',
  '실패가 누적되면 토큰 잠금(성공 후 초기화됐으므로 5회 연속 실패 기준)');
select pg_temp.assert(
  (select result = 'LOCKED' from public.verify_user_consent_identity(encode(sha256('tok-2'::bytea), 'hex'), '1950-01-01', '2222')),
  '잠긴 토큰은 올바른 정보여도 거부');
reset role;

-- 보호자가 다시 발급하면 새 토큰으로 진행 가능
select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000c1',
  encode(sha256('tok-3'::bytea), 'hex'), 'MANUAL_LINK');
reset role;

-- 본인 동의 제출 (share_medical_info 는 본인이 선택)
set local role service_role;
select pg_temp.assert(
  (select result = 'OK'
     from public.submit_user_consent(encode(sha256('tok-3'::bytea), 'hex'), '1950-01-01', '2222', true, true, '2026-09-06')),
  '본인 확인 후 동의 제출 성공');
reset role;

select pg_temp.assert(
  (select user_consent_status = 'CONFIRMED' and user_consent_confirmed_at = now()
          and pre_matching_health_consented_at = now() and pre_matching_health_consent_version = '2026-09-06'
          and share_medical_info = true
          and user_consent_channel = 'MANUAL_LINK'
     from public.reservations where id = '00000306-0000-4000-8000-0000000000c1'),
  '본인 동의 완료 시 상태·서버 시각·매칭 전 건강정보 동의·진료내용 전달 동의·확정 링크 전달 방식이 기록됨');

set local role service_role;
select pg_temp.assert(
  public.get_user_consent_token_state(encode(sha256('tok-3'::bytea), 'hex')) = 'USED',
  '사용한 토큰은 USED');
select pg_temp.assert(
  (select result = 'USED'
     from public.submit_user_consent(encode(sha256('tok-3'::bytea), 'hex'), '1950-01-01', '2222', true, false, '2026-09-06')),
  '이미 사용한 토큰으로 재제출 불가');
reset role;

-- 동의 완료 후에는 파트너에게 노출
select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"PARTNER"}}', true);
set local role authenticated;
select pg_temp.assert(
  (select mobility_status = '부축 필요' from public.partner_list_open_reservations(200, 0)
    where id = '00000306-0000-4000-8000-0000000000c1'),
  '본인 동의 완료 후에는 파트너 목록에 거동·인지 상태와 함께 노출');
reset role;

-- 만료 토큰
select pg_temp.ins('00000306-0000-4000-8000-0000000000d1', 'T306-EXPIRE', '부모', 'USER_DIRECT', 'PENDING_USER', null, null, false, now());
insert into public.reservation_consent_tokens (reservation_id, token_hash, expires_at)
values ('00000306-0000-4000-8000-0000000000d1', encode(sha256('tok-old'::bytea), 'hex'), now() - interval '1 minute');
set local role service_role;
select pg_temp.assert(
  public.get_user_consent_token_state(encode(sha256('tok-old'::bytea), 'hex')) = 'EXPIRED',
  '만료된 토큰은 EXPIRED');
select pg_temp.assert(
  (select result = 'EXPIRED'
     from public.submit_user_consent(encode(sha256('tok-old'::bytea), 'hex'), '1950-01-01', '2222', true, true, '2026-09-06')),
  '만료된 토큰으로는 제출 불가');
reset role;

-- 발급 횟수 제한(시간당 5회)
select pg_temp.ins('00000306-0000-4000-8000-0000000000d2', 'T306-RATE', '부모', 'USER_DIRECT', 'PENDING_USER', null, null, false, now());
select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000d2', encode(sha256(('r' || g)::bytea), 'hex'), 'MANUAL_LINK')
  from generate_series(1, 5) g;
select pg_temp.expect_sqlstate(
  $q$select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000d2', encode(sha256('r6'::bytea), 'hex'), 'MANUAL_LINK')$q$,
  'P0001', '재발급은 시간당 5회로 제한');

-- 일반 권한은 검증·제출 RPC 를 호출할 수 없다
select pg_temp.expect_sqlstate(
  $q$select * from public.submit_user_consent(encode(sha256('x'::bytea), 'hex'), '1950-01-01', '2222', true, true, '2026-09-06')$q$,
  '42501', 'authenticated 는 submit_user_consent 실행 불가');
select pg_temp.expect_sqlstate(
  $q$select * from public.verify_user_consent_identity(encode(sha256('x'::bytea), 'hex'), '1950-01-01', '2222')$q$,
  '42501', 'authenticated 는 verify_user_consent_identity 실행 불가');
reset role;
set local role anon;
select pg_temp.expect_sqlstate(
  $q$select * from public.submit_user_consent(encode(sha256('x'::bytea), 'hex'), '1950-01-01', '2222', true, true, '2026-09-06')$q$,
  '42501', 'anon 은 submit_user_consent 실행 불가');
select pg_temp.expect_sqlstate(
  $q$select public.issue_user_consent_token('00000306-0000-4000-8000-0000000000d2', encode(sha256('r7'::bytea), 'hex'), 'MANUAL_LINK')$q$,
  '42501', 'anon 은 토큰을 발급할 수 없음');
reset role;

-- =============================================================
-- Case 5: 제10조 ④ — 확정 후에도 고객은 대리 예약의 share_medical_info 를 켤 수 없다 (SELF 는 변경 가능)
-- =============================================================
select set_config('request.jwt.claims',
  '{"sub":"00000306-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_sqlstate(
  $q$update public.reservations set share_medical_info = true
      where id = '00000306-0000-4000-8000-0000000000c2'$q$,
  '42501', 'GUARDIAN_PROXY 확정 후에도 고객이 share_medical_info 를 켤 수 없음');
select pg_temp.expect_sqlstate(
  $q$update public.reservations set share_medical_info = false
      where id = '00000306-0000-4000-8000-0000000000c1'$q$,
  '42501', 'USER_DIRECT 확정 후 고객이 share_medical_info 를 바꿀 수 없음(본인이 true 로 확정한 값 유지)');
update public.reservations set share_medical_info = true
 where id = '00000306-0000-4000-8000-0000000000c3';
select pg_temp.assert(
  (select share_medical_info from public.reservations where id = '00000306-0000-4000-8000-0000000000c3'),
  'SELF 예약은 본인이 share_medical_info 를 변경할 수 있음(회귀)');
reset role;

-- =============================================================
-- Case 6: 본인 확인 NULL 입력은 실패로 집계된다
-- =============================================================
select pg_temp.ins('00000306-0000-4000-8000-0000000000d3', 'T306-NULLID', '부모', 'USER_DIRECT', 'PENDING_USER',
  null, null, false, now());
insert into public.reservation_consent_tokens (reservation_id, token_hash, expires_at)
values ('00000306-0000-4000-8000-0000000000d3', encode(sha256('tok-null'::bytea), 'hex'), now() + interval '1 hour');
set local role service_role;
select pg_temp.assert(
  (select result = 'MISMATCH' and attempts_left = 4
     from public.verify_user_consent_identity(encode(sha256('tok-null'::bytea), 'hex'), '1950-01-01', null)),
  '연락처 끝 4자리가 NULL 이면 생년월일이 맞아도 MISMATCH');
select pg_temp.assert(
  (select result = 'MISMATCH' and attempts_left = 3
     from public.verify_user_consent_identity(encode(sha256('tok-null'::bytea), 'hex'), null, '2222')),
  '생년월일이 NULL 이면 MISMATCH');
select pg_temp.assert(
  (select failed_attempts = 2 from public.reservation_consent_tokens
    where token_hash = encode(sha256('tok-null'::bytea), 'hex')),
  'NULL 입력도 실패 횟수로 집계됨');
select pg_temp.assert(
  (select result = 'MISMATCH'
     from public.submit_user_consent(encode(sha256('tok-null'::bytea), 'hex'), '1950-01-01', null, true, true, '2026-09-06')),
  'NULL 끝 4자리로는 동의를 제출할 수 없음');
reset role;

-- =============================================================
-- Case 7: 보유기간 만료 파기 시 자유서술 대리 사유가 남지 않는다 (마이그레이션 59·88 과 같은 personal_data_purged_at 기준)
-- =============================================================
select pg_temp.assert(
  (select proxy_reason_detail is not null from public.reservations
    where id = '00000306-0000-4000-8000-0000000000c2'),
  '파기 전에는 대리 사유 상세가 있음');
update public.reservations set personal_data_purged_at = now()
 where id = '00000306-0000-4000-8000-0000000000c2';
select pg_temp.assert(
  (select proxy_reason_detail is null and proxy_reason_code = 'LACKS_CAPACITY'
          and user_consent_mode = 'GUARDIAN_PROXY'
     from public.reservations where id = '00000306-0000-4000-8000-0000000000c2'),
  '파기 후 proxy_reason_detail 은 비워지고 분류 코드·동의 이력은 유지됨(체크 제약 통과)');

-- =============================================================
-- Case 8: 서비스 시작 시각이 지난 본인 동의 대기 예약 자동 정리 (#310)
--   e1 시작 시각 경과 + PENDING_USER  → CANCELLED / USER_CONSENT_EXPIRED, 토큰 폐기, 전용 안내
--   e2 시작 시각 전   + PENDING_USER  → 그대로
--   e3 시작 시각 경과 + 본인 동의 완료(CONFIRMED) → 기존과 같이 EXPIRED
-- =============================================================
select pg_temp.ins('00000306-0000-4000-8000-0000000000e1', 'T306-EXP-PENDING', '부모', 'USER_DIRECT', 'PENDING_USER',
  null, null, false, now());
select pg_temp.ins('00000306-0000-4000-8000-0000000000e2', 'T306-FUT-PENDING', '부모', 'USER_DIRECT', 'PENDING_USER',
  null, null, false, now());
select pg_temp.ins('00000306-0000-4000-8000-0000000000e3', 'T306-EXP-CONFIRMED', '부모', 'USER_DIRECT', 'CONFIRMED',
  null, null, false, now(), now(), null, now(), '2026-09-06');
update public.reservations
   set use_date = (now() at time zone 'Asia/Seoul')::date - 1
 where id in ('00000306-0000-4000-8000-0000000000e1', '00000306-0000-4000-8000-0000000000e3');
insert into public.reservation_consent_tokens (reservation_id, token_hash, expires_at)
values ('00000306-0000-4000-8000-0000000000e1', encode(sha256('tok-exp'::bytea), 'hex'), now() - interval '1 hour');

create function pg_temp.consent_evidence(p_id uuid) returns jsonb
language sql as $$
  select to_jsonb(x) from (
    select user_consent_mode, user_consent_status, user_consent_requested_at, user_consent_confirmed_at,
         user_consent_channel, proxy_reason_code, proxy_reason_detail, proxy_authority_confirmed_at,
         proxy_authority_version, share_medical_info,
         pre_matching_health_consented_at, pre_matching_health_consent_version
      from public.reservations where id = p_id
  ) x
$$;
create temp table before_e1 as
  select pg_temp.consent_evidence('00000306-0000-4000-8000-0000000000e1') as ev;

select public.expire_past_matchings();

select pg_temp.assert(
  (select status = 'CANCELLED' and cancel_reason = 'USER_CONSENT_EXPIRED' and cancelled_at is not null
     from public.reservations where id = '00000306-0000-4000-8000-0000000000e1'),
  '시작 시각이 지난 PENDING_USER 예약은 USER_CONSENT_EXPIRED 로 취소됨');
select pg_temp.assert(
  pg_temp.consent_evidence('00000306-0000-4000-8000-0000000000e1') = (select ev from before_e1),
  '정리 시 동의 증거 컬럼은 바뀌지 않음');
select pg_temp.assert(
  (select revoked_at is not null from public.reservation_consent_tokens
    where token_hash = encode(sha256('tok-exp'::bytea), 'hex')),
  '정리된 예약의 미사용 동의 토큰은 폐기됨');
select pg_temp.assert(
  (select count(*) = 1 from public.notifications
    where link = '/mypage/reservations/00000306-0000-4000-8000-0000000000e1'
      and recipient_id = '00000306-0000-4000-8000-000000000001'
      and type = 'RESERVATION_CANCELLED'
      and title = '이용자 본인 동의가 없어 예약이 취소되었어요'),
  '예약자에게 본인 동의 미완료 사유로 안내함');
select pg_temp.assert(
  (select status = 'MATCHING' and cancel_reason is null and user_consent_status = 'PENDING_USER'
     from public.reservations where id = '00000306-0000-4000-8000-0000000000e2'),
  '시작 시각 전의 PENDING_USER 예약은 영향 없음');
select pg_temp.assert(
  (select status = 'CANCELLED' and cancel_reason = 'EXPIRED'
     from public.reservations where id = '00000306-0000-4000-8000-0000000000e3'),
  '동의 완료 예약은 기존과 같이 EXPIRED 로 만료됨(회귀)');
select pg_temp.assert(
  (select count(*) = 1 from public.notifications
    where link = '/mypage/reservations/00000306-0000-4000-8000-0000000000e3'
      and title = '서비스 시작 시각이 지나 예약이 취소되었어요'),
  '동의 완료 예약은 기존 만료 문구로 안내함(회귀)');

rollback;

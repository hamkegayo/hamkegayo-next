-- 로그인할 수 없는 회원의 운영자 탈퇴 처리 (#293) — 모든 활성 관리자(2단계 인증 완료, 담당 구분 없음, is_admin_live)·MFA 경계, 대상 제한(USER·PARTNER),
-- 정확 일치 조회·접속기록(검색어 원문 미기록), withdraw_member 재사용(분리 보관·보존·파기·소셜 해제 트리거),
-- 연결 해제 건 동시 파기, 거절 조건 전체 롤백, 사유 길이.
begin;
create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end;
$$;
-- 예외 메시지에 p_expect 가 들어 있어야 통과한다. 예외 블록이 서브트랜잭션이라 실패한 변경은 롤백된다.
create function pg_temp.rejects(p_sql text, p_expect text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expect in sqlerrm) = 0 then
      raise exception 'FAIL: % — expected %, got %', p_label, p_expect, sqlerrm;
    end if;
    raise notice 'PASS: % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — expected %', p_label, p_expect;
end;
$$;
create function pg_temp.as_user(p_id text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;

-- ---------- 고정 데이터 ----------
-- 관리자: 101 정상, 102 비밀번호 변경 필요, 103 정지, 104 대상이 되는 다른 관리자
-- 회원: 111 USER(탈퇴 대상), 112 USER(다른 회원), 113 USER(미납), 114 USER(진행 예약), 115 USER(연결 해제 건)
-- 파트너: 121 PARTNER
insert into auth.users(id,email,raw_user_meta_data) values
  ('00000293-0000-4000-8000-000000000101','wd-admin@example.invalid','{}'),
  ('00000293-0000-4000-8000-000000000102','wd-admin-pw@example.invalid','{}'),
  ('00000293-0000-4000-8000-000000000103','wd-admin-susp@example.invalid','{}'),
  ('00000293-0000-4000-8000-000000000104','wd-admin-other@example.invalid','{}'),
  ('00000293-0000-4000-8000-000000000111','wd-user@example.invalid','{"name":"카카오닉네임","avatar_url":"https://example.invalid/a.png"}'),
  ('00000293-0000-4000-8000-000000000112','wd-other@example.invalid','{}'),
  ('00000293-0000-4000-8000-000000000113','wd-debtor@example.invalid','{}'),
  ('00000293-0000-4000-8000-000000000114','wd-booked@example.invalid','{}'),
  ('00000293-0000-4000-8000-000000000115','wd-unlink@example.invalid','{"name":"연결해제"}'),
  ('00000293-0000-4000-8000-000000000121','wd-partner@example.invalid','{}');
insert into public.profiles(id,name,role,status,email,phone) values
  ('00000293-0000-4000-8000-000000000101','WD Admin','ADMIN','ACTIVE','wd-admin@example.invalid','01029300101'),
  ('00000293-0000-4000-8000-000000000102','WD Admin PW','ADMIN','ACTIVE','wd-admin-pw@example.invalid',null),
  ('00000293-0000-4000-8000-000000000103','WD Admin Susp','ADMIN','SUSPENDED','wd-admin-susp@example.invalid',null),
  ('00000293-0000-4000-8000-000000000104','WD Admin Other','ADMIN','ACTIVE','wd-admin-other@example.invalid','01029300104'),
  ('00000293-0000-4000-8000-000000000111','탈퇴대상','USER','ACTIVE','wd-user@example.invalid','010-2930-0111'),
  ('00000293-0000-4000-8000-000000000112','다른회원','USER','ACTIVE','wd-other@example.invalid','01029300112'),
  ('00000293-0000-4000-8000-000000000113','미납회원','USER','ACTIVE','wd-debtor@example.invalid','01029300113'),
  ('00000293-0000-4000-8000-000000000114','예약회원','USER','ACTIVE','wd-booked@example.invalid','01029300114'),
  ('00000293-0000-4000-8000-000000000115','연결해제회원','USER','ACTIVE','wd-unlink@example.invalid','01029300115'),
  ('00000293-0000-4000-8000-000000000121','탈퇴파트너','PARTNER','ACTIVE','wd-partner@example.invalid','01029300121');
-- 역할 동기화 트리거가 app_metadata 를 쓴 뒤에 비밀번호 변경 필요 표시를 얹는다.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"must_change_password":true}'::jsonb
 where id = '00000293-0000-4000-8000-000000000102';

insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values
  ('2930000111','00000293-0000-4000-8000-000000000111','{"sub":"2930000111"}','kakao',now(),now()),
  ('naver-293-111','00000293-0000-4000-8000-000000000111','{"sub":"naver-293-111"}','custom:naver',now(),now()),
  ('00000293-0000-4000-8000-000000000111','00000293-0000-4000-8000-000000000111',
   '{"sub":"00000293-0000-4000-8000-000000000111"}','email',now(),now()),
  ('2930000115','00000293-0000-4000-8000-000000000115','{"sub":"2930000115"}','kakao',now(),now());

-- 111: 보존 대상(완료 예약·결제)과 파기 대상(알림·피보호자)
insert into public.reservations(id,code,customer_id,status,plan,use_date,arrive_time,reserve_time,duration,duration_minutes,hospital_address)
values ('00000293-0000-4000-8000-000000000211','TEST-293-ADMIN-A','00000293-0000-4000-8000-000000000111','COMPLETED','basic',
        '2099-01-01','09:00','09:30','2시간',120,'Test');
insert into public.payments(reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,paid_at)
values ('00000293-0000-4000-8000-000000000211','BASE','PAID','TEST-293-ADMIN-ORD-A',40000,0,8000,32000,now());
insert into public.notifications(recipient_id,type,title) values
  ('00000293-0000-4000-8000-000000000111','TEST','테스트 알림');
insert into public.care_recipients(user_id,name) values
  ('00000293-0000-4000-8000-000000000111','피보호자');

-- 113: 기한이 지난 미납 추가결제
insert into public.reservations(id,code,customer_id,status,plan,use_date,arrive_time,reserve_time,duration,duration_minutes,hospital_address)
values ('00000293-0000-4000-8000-000000000213','TEST-293-ADMIN-B','00000293-0000-4000-8000-000000000113','COMPLETED','basic',
        '2099-01-01','09:00','09:30','2시간',120,'Test');
insert into public.payments(reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,link_sent_at,token_expires_at)
values ('00000293-0000-4000-8000-000000000213','EXTENSION','PENDING','TEST-293-ADMIN-ORD-B',12000,0,0,12000,
        now() - interval '1 day', now() - interval '1 minute');

-- 114: 진행 예정 예약 (직접 상태를 넣는다 — 예약 생성 게이트는 이 테스트 범위가 아니다)
insert into public.reservations(id,code,customer_id,status,plan,use_date,arrive_time,reserve_time,duration,duration_minutes,hospital_address)
values ('00000293-0000-4000-8000-000000000214','TEST-293-ADMIN-C','00000293-0000-4000-8000-000000000114','COMPLETED','basic',
        '2099-01-01','09:00','09:30','2시간',120,'Test');
update public.reservations set status='MATCHING' where id='00000293-0000-4000-8000-000000000214';

-- 121: 파트너 로그인 아이디 + 진행 예정 서비스
insert into public.partner_accounts(profile_id,login_id) values
  ('00000293-0000-4000-8000-000000000121','test-293-wd-partner');
insert into public.reservations(id,code,customer_id,status,plan,use_date,arrive_time,reserve_time,duration,duration_minutes,hospital_address,confirmed_partner_id)
values ('00000293-0000-4000-8000-000000000221','TEST-293-ADMIN-P1','00000293-0000-4000-8000-000000000112','COMPLETED','basic',
        '2099-01-01','09:00','09:30','2시간',120,'Test','00000293-0000-4000-8000-000000000121'),
       ('00000293-0000-4000-8000-000000000222','TEST-293-ADMIN-P2','00000293-0000-4000-8000-000000000112','COMPLETED','basic',
        '2099-01-01','09:00','09:30','2시간',120,'Test','00000293-0000-4000-8000-000000000121');
insert into public.services(id,reservation_id,partner_id,status) values
  ('00000293-0000-4000-8000-000000000321','00000293-0000-4000-8000-000000000221','00000293-0000-4000-8000-000000000121','SCHEDULED');

-- 연결 해제 건: 115 본인 건, 112 다른 회원 건
insert into public.social_unlink_events(id,provider,provider_user_id,referrer_type,user_id) values
  ('00000293-0000-4000-8000-000000000415','kakao','2930000115','ACCOUNT_DELETE','00000293-0000-4000-8000-000000000115'),
  ('00000293-0000-4000-8000-000000000412','kakao','2930000112','ACCOUNT_DELETE','00000293-0000-4000-8000-000000000112');

-- =============================================================
-- 권한 경계
-- =============================================================
select pg_temp.assert(
  not has_function_privilege('anon','public.admin_find_member_for_withdrawal(text)','execute')
  and not has_function_privilege('anon','public.admin_withdraw_member(uuid,text,uuid)','execute')
  and has_function_privilege('authenticated','public.admin_find_member_for_withdrawal(text)','execute')
  and has_function_privilege('authenticated','public.admin_withdraw_member(uuid,text,uuid)','execute'),
  'anon cannot execute; authenticated gated inside');
select pg_temp.assert(
  not has_function_privilege('authenticated','public.withdraw_member(uuid,text)','execute')
  and not has_function_privilege('anon','public.withdraw_member(uuid,text)','execute'),
  'withdraw_member stays revoked from clients');

set local role anon;
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('wd-user@example.invalid')$q$,
  'permission denied', 'anon cannot look up');
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000111','고객문의 확인함')$q$,
  'permission denied', 'anon cannot withdraw');
reset role;

-- USER · PARTNER · MFA 미인증 · 비밀번호 변경 필요 · 정지 관리자는 모두 forbidden
do $$
declare
  v_case record;
begin
  for v_case in
    select * from (values
      ('00000293-0000-4000-8000-000000000112','aal2','USER'),
      ('00000293-0000-4000-8000-000000000121','aal2','PARTNER'),
      ('00000293-0000-4000-8000-000000000101','aal1','admin without MFA'),
      ('00000293-0000-4000-8000-000000000102','aal2','admin must change password'),
      ('00000293-0000-4000-8000-000000000103','aal2','suspended admin')
    ) t(uid, aal, label)
  loop
    perform pg_temp.as_user(v_case.uid, v_case.aal);
    set local role authenticated;
    perform pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('wd-user@example.invalid')$q$,
      'forbidden', v_case.label || ' cannot look up');
    perform pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000111','고객문의 확인함')$q$,
      'forbidden', v_case.label || ' cannot withdraw');
    perform pg_temp.rejects($q$select public.withdraw_member('00000293-0000-4000-8000-000000000111', null)$q$,
      'permission denied', v_case.label || ' cannot call withdraw_member');
    reset role;
  end loop;
end;
$$;
select pg_temp.assert(
  (select status::text from public.profiles where id='00000293-0000-4000-8000-000000000111') = 'ACTIVE'
  and not exists(select 1 from public.access_logs where actor_id::text like '00000293-0000-4000-8000-0000000001%'),
  'denied callers changed nothing and left no access log');

-- =============================================================
-- 조회 — 정확 일치만, ADMIN 비노출, 접속기록(원문 미기록)
-- =============================================================
select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;

select pg_temp.assert(
  (select count(*) = 1 and bool_and(id='00000293-0000-4000-8000-000000000111' and role='USER' and blocker_code is null)
     from public.admin_find_member_for_withdrawal('  WD-User@Example.INVALID '))
  , 'email lookup is exact and case-insensitive');
select pg_temp.assert(
  (select count(*) = 1 and bool_and(id='00000293-0000-4000-8000-000000000111')
     from public.admin_find_member_for_withdrawal('01029300111')),
  'phone lookup ignores hyphens in stored value');
select pg_temp.assert(
  (select count(*) = 1 and bool_and(id='00000293-0000-4000-8000-000000000111')
     from public.admin_find_member_for_withdrawal('010-2930-0111')),
  'phone lookup ignores hyphens in query');
select pg_temp.assert(
  (select count(*) = 1 and bool_and(id='00000293-0000-4000-8000-000000000121' and role='PARTNER')
     from public.admin_find_member_for_withdrawal('00000293-0000-4000-8000-000000000121')),
  'uuid lookup finds partner');
select pg_temp.assert(
  (select blocker_code from public.admin_find_member_for_withdrawal('00000293-0000-4000-8000-000000000121')) = 'ACTIVE_SERVICE',
  'partner blocker shown in advance');
select pg_temp.assert(
  (select blocker_code from public.admin_find_member_for_withdrawal('wd-debtor@example.invalid')) = 'UNPAID_CHARGE'
  and (select blocker_code from public.admin_find_member_for_withdrawal('wd-booked@example.invalid')) = 'ACTIVE_RESERVATION',
  'user blockers shown in advance');
select pg_temp.assert(
  not exists(select 1 from public.admin_find_member_for_withdrawal('wd-admin-other@example.invalid'))
  and not exists(select 1 from public.admin_find_member_for_withdrawal('00000293-0000-4000-8000-000000000104'))
  and not exists(select 1 from public.admin_find_member_for_withdrawal('01029300104')),
  'ADMIN profiles are never returned');
select pg_temp.assert(
  not exists(select 1 from public.admin_find_member_for_withdrawal('wd-user@example.invali')),
  'near-miss email returns nothing');
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('wd-user')$q$, 'invalid_query', 'partial text rejected');
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('탈퇴대상')$q$, 'invalid_query', 'name search rejected');
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('')$q$, 'invalid_query', 'empty query rejected');
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal(null)$q$, 'invalid_query', 'null query rejected');
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('0102930')$q$, 'invalid_query', 'short phone fragment rejected');
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('010-2930-0111 홍길동')$q$, 'invalid_query', 'phone mixed with text rejected');
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('00000293-0000-4000-8000')$q$, 'invalid_query', 'partial uuid rejected');
select pg_temp.rejects($q$select * from public.admin_find_member_for_withdrawal('a@b c.com')$q$, 'invalid_query', 'email with space rejected');
reset role;

select pg_temp.assert(
  (select count(*) from public.access_logs
    where actor_id='00000293-0000-4000-8000-000000000101' and action='MEMBER_WITHDRAWAL_LOOKUP') = 11,
  'every valid lookup leaves one access log (invalid ones do not)');
select pg_temp.assert(
  exists(select 1 from public.access_logs
          where actor_id='00000293-0000-4000-8000-000000000101' and action='MEMBER_WITHDRAWAL_LOOKUP'
            and subject_id='00000293-0000-4000-8000-000000000111' and target_table='profiles'
            and reason='운영자 탈퇴 대상 조회 (email)'),
  'lookup log points at found member with kind only');
select pg_temp.assert(
  not exists(select 1 from public.access_logs
              where actor_id='00000293-0000-4000-8000-000000000101'
                and (reason ilike '%@%' or reason like '%2930%' or reason like '%탈퇴대상%')),
  'lookup log never contains the raw query (email/phone/name)');
select pg_temp.assert(
  exists(select 1 from public.access_logs
          where actor_id='00000293-0000-4000-8000-000000000101' and action='MEMBER_WITHDRAWAL_LOOKUP'
            and subject_id is null and target_id is null),
  'no-result lookup is logged without subject');

-- =============================================================
-- 대상 제한 · 사유 길이
-- =============================================================
select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000104','고객문의 확인함')$q$,
  'ADMIN_NOT_ALLOWED', 'another admin cannot be withdrawn');
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000101','고객문의 확인함')$q$,
  'ADMIN_NOT_ALLOWED', 'admin cannot withdraw self');
select pg_temp.rejects($q$select public.admin_withdraw_member(gen_random_uuid(),'고객문의 확인함')$q$,
  'PROFILE_NOT_FOUND', 'unknown member rejected');
select pg_temp.rejects($q$select public.admin_withdraw_member(null,'고객문의 확인함')$q$,
  'invalid_input', 'null member rejected');
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000111','  확인  ')$q$,
  'invalid_reason', 'reason under 5 chars rejected');
select pg_temp.rejects(format($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000111', %L)$q$, repeat('가', 501)),
  'invalid_reason', 'reason over 500 chars rejected');
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000111',null)$q$,
  'invalid_reason', 'null reason rejected');
reset role;
select pg_temp.assert(
  (select status::text from public.profiles where id='00000293-0000-4000-8000-000000000104') = 'ACTIVE'
  and (select status::text from public.profiles where id='00000293-0000-4000-8000-000000000111') = 'ACTIVE',
  'rejected targets untouched');

-- =============================================================
-- USER 차단 조건 — 탈퇴·연결 해제 파기·접속기록 모두 롤백
-- =============================================================
insert into public.social_unlink_events(id,provider,provider_user_id,referrer_type,user_id) values
  ('00000293-0000-4000-8000-000000000413','kakao','2930000113','UNLINK_FROM_APPS','00000293-0000-4000-8000-000000000113'),
  ('00000293-0000-4000-8000-000000000414','kakao','2930000114','UNLINK_FROM_APPS','00000293-0000-4000-8000-000000000114');
select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000113','이메일로 탈퇴 의사 확인','00000293-0000-4000-8000-000000000413')$q$,
  'UNPAID_CHARGE', 'unpaid charge blocks admin withdrawal');
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000114','이메일로 탈퇴 의사 확인','00000293-0000-4000-8000-000000000414')$q$,
  'ACTIVE_RESERVATION', 'active reservation blocks admin withdrawal');
reset role;
select pg_temp.assert(
  (select count(*) from public.profiles
    where id in ('00000293-0000-4000-8000-000000000113','00000293-0000-4000-8000-000000000114')
      and status='ACTIVE' and name in ('미납회원','예약회원') and email is not null) = 2
  and not exists(select 1 from public.withdrawn_members
                  where profile_id in ('00000293-0000-4000-8000-000000000113','00000293-0000-4000-8000-000000000114')),
  'blocked withdrawals left profiles untouched');
select pg_temp.assert(
  (select count(*) from public.social_unlink_events
    where id in ('00000293-0000-4000-8000-000000000413','00000293-0000-4000-8000-000000000414')) = 2,
  'blocked withdrawals kept social unlink events');
select pg_temp.assert(
  not exists(select 1 from public.access_logs
              where action in ('ADMIN_MEMBER_WITHDRAW','SOCIAL_UNLINK_RESOLVE')
                and subject_id in ('00000293-0000-4000-8000-000000000113','00000293-0000-4000-8000-000000000114')),
  'blocked withdrawals left no access log');

-- =============================================================
-- USER 운영자 탈퇴 — withdraw_member 재사용 결과 전체
-- =============================================================
select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;
select pg_temp.assert(
  public.admin_withdraw_member('00000293-0000-4000-8000-000000000111','  이메일 문의로 본인 탈퇴 의사 확인  ')
    = '{"profile_id":"00000293-0000-4000-8000-000000000111","social_unlink_resolved":false}'::jsonb,
  'admin withdrawal returns profile id');
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000111','이메일 문의로 본인 탈퇴 의사 확인')$q$,
  'ALREADY_WITHDRAWN', 'second admin withdrawal rejected');
-- 탈퇴한 회원은 UUID 로만 찾을 수 있고 차단 사유가 없다
select pg_temp.assert(
  (select status = 'WITHDRAWN' and withdrawn_at is not null and email is null and blocker_code is null
     from public.admin_find_member_for_withdrawal('00000293-0000-4000-8000-000000000111')),
  'withdrawn member visible by uuid as WITHDRAWN');
select pg_temp.assert(
  not exists(select 1 from public.admin_find_member_for_withdrawal('wd-user@example.invalid')),
  'withdrawn member no longer found by email');
reset role;

select pg_temp.assert(
  (select name='탈퇴회원' and phone is null and email is null and status='WITHDRAWN' and withdrawn_at is not null
     from public.profiles where id='00000293-0000-4000-8000-000000000111'),
  'profile anonymized');
select pg_temp.assert(
  (select name='탈퇴대상' and email='wd-user@example.invalid' and phone='010-2930-0111' and role='USER'
          and reason='이메일 문의로 본인 탈퇴 의사 확인'
          and purge_after between now() + interval '3 years' - interval '1 minute' and now() + interval '3 years' + interval '1 minute'
     from public.withdrawn_members where profile_id='00000293-0000-4000-8000-000000000111'),
  'identity kept separately for 3 years with trimmed reason');
select pg_temp.assert(
  exists(select 1 from public.reservations where id='00000293-0000-4000-8000-000000000211' and status='COMPLETED')
  and exists(select 1 from public.payments where order_id='TEST-293-ADMIN-ORD-A' and gross_amount=40000),
  'reservation and payment kept');
select pg_temp.assert(
  not exists(select 1 from public.notifications where recipient_id='00000293-0000-4000-8000-000000000111')
  and not exists(select 1 from public.care_recipients where user_id='00000293-0000-4000-8000-000000000111'),
  'notifications and care recipients purged');
select pg_temp.assert(
  not exists(select 1 from auth.identities
              where user_id='00000293-0000-4000-8000-000000000111' and provider in ('kakao','custom:naver'))
  and exists(select 1 from auth.identities
              where user_id='00000293-0000-4000-8000-000000000111' and provider='email')
  and (select raw_user_meta_data from auth.users where id='00000293-0000-4000-8000-000000000111') = '{}'::jsonb,
  'migration 109 trigger released kakao/naver, kept email, cleared metadata');
select pg_temp.assert(
  (select count(*) from public.access_logs
    where actor_id='00000293-0000-4000-8000-000000000101' and action='ADMIN_MEMBER_WITHDRAW'
      and target_table='profiles' and target_id='00000293-0000-4000-8000-000000000111'
      and subject_id='00000293-0000-4000-8000-000000000111'
      and reason='이메일 문의로 본인 탈퇴 의사 확인') = 1,
  'ADMIN_MEMBER_WITHDRAW logged once');

-- =============================================================
-- 연결 해제 건 연동
-- =============================================================
select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000115','카카오톡 문의로 탈퇴 의사 확인','00000293-0000-4000-8000-000000000412')$q$,
  'SOCIAL_UNLINK_USER_MISMATCH', 'unlink event of another member rejected');
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000115','카카오톡 문의로 탈퇴 의사 확인',gen_random_uuid())$q$,
  'SOCIAL_UNLINK_NOT_FOUND', 'unknown unlink event rejected');
reset role;
select pg_temp.assert(
  (select status::text from public.profiles where id='00000293-0000-4000-8000-000000000115') = 'ACTIVE'
  and exists(select 1 from public.social_unlink_events where id='00000293-0000-4000-8000-000000000412'),
  'mismatch left member and other event untouched');

select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;
select pg_temp.assert(
  (public.admin_withdraw_member('00000293-0000-4000-8000-000000000115','카카오톡 문의로 탈퇴 의사 확인',
     '00000293-0000-4000-8000-000000000415') ->> 'social_unlink_resolved')::boolean,
  'withdrawal with unlink event succeeds');
reset role;
select pg_temp.assert(
  (select status::text from public.profiles where id='00000293-0000-4000-8000-000000000115') = 'WITHDRAWN'
  and not exists(select 1 from public.social_unlink_events where id='00000293-0000-4000-8000-000000000415')
  and not exists(select 1 from auth.identities where user_id='00000293-0000-4000-8000-000000000115' and provider='kakao'),
  'member withdrawn and unlink event purged in same transaction');
select pg_temp.assert(
  exists(select 1 from public.access_logs
          where actor_id='00000293-0000-4000-8000-000000000101' and action='SOCIAL_UNLINK_RESOLVE'
            and target_table='social_unlink_events' and target_id='00000293-0000-4000-8000-000000000415'
            and subject_id='00000293-0000-4000-8000-000000000115' and reason='카카오톡 문의로 탈퇴 의사 확인')
  and exists(select 1 from public.access_logs
              where actor_id='00000293-0000-4000-8000-000000000101' and action='ADMIN_MEMBER_WITHDRAW'
                and subject_id='00000293-0000-4000-8000-000000000115'),
  'SOCIAL_UNLINK_RESOLVE and ADMIN_MEMBER_WITHDRAW logged');

-- =============================================================
-- PARTNER 운영자 탈퇴 — 진행 서비스·미지급 정산 차단 후 지급 완료 시 성공
-- =============================================================
select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000121','이메일로 파트너 탈퇴 의사 확인')$q$,
  'ACTIVE_SERVICE', 'active service blocks partner withdrawal');
reset role;

delete from public.services where id='00000293-0000-4000-8000-000000000321';
insert into public.services(id,reservation_id,partner_id,status,started_at,ended_at) values
  ('00000293-0000-4000-8000-000000000322','00000293-0000-4000-8000-000000000222','00000293-0000-4000-8000-000000000121',
   'COMPLETED',now() - interval '2 hours',now());
insert into public.settlements(id,service_id,partner_id,amount,fee,net,status) values
  ('00000293-0000-4000-8000-000000000522','00000293-0000-4000-8000-000000000322','00000293-0000-4000-8000-000000000121',
   40000,8000,32000,'PENDING');

select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;
select pg_temp.assert(
  (select blocker_code from public.admin_find_member_for_withdrawal('wd-partner@example.invalid')) = 'PENDING_SETTLEMENT',
  'pending settlement shown in advance');
select pg_temp.rejects($q$select public.admin_withdraw_member('00000293-0000-4000-8000-000000000121','이메일로 파트너 탈퇴 의사 확인')$q$,
  'PENDING_SETTLEMENT', 'pending settlement blocks partner withdrawal');
reset role;
select pg_temp.assert(
  exists(select 1 from public.partner_accounts where profile_id='00000293-0000-4000-8000-000000000121')
  and (select status::text from public.profiles where id='00000293-0000-4000-8000-000000000121') = 'ACTIVE',
  'blocked partner untouched');

update public.settlements set status='PAID', settled_at=now() where id='00000293-0000-4000-8000-000000000522';
select pg_temp.as_user('00000293-0000-4000-8000-000000000101');
set local role authenticated;
select public.admin_withdraw_member('00000293-0000-4000-8000-000000000121','이메일로 파트너 탈퇴 의사 확인');
reset role;
select pg_temp.assert(
  (select status::text from public.profiles where id='00000293-0000-4000-8000-000000000121') = 'WITHDRAWN'
  and not exists(select 1 from public.partner_accounts where profile_id='00000293-0000-4000-8000-000000000121')
  and exists(select 1 from public.withdrawn_members where profile_id='00000293-0000-4000-8000-000000000121' and role='PARTNER'),
  'partner withdrawn and login id purged');
select pg_temp.assert(
  (select net=32000 and partner_id='00000293-0000-4000-8000-000000000121'
     from public.settlements where id='00000293-0000-4000-8000-000000000522')
  and exists(select 1 from public.services where id='00000293-0000-4000-8000-000000000322' and status='COMPLETED'),
  'settlement and service record kept');

rollback;

-- 카카오 연결 해제 웹훅 기록 (#291) — 적재 권한·회원 매칭·재전송 중복·관리자 조회/처리·접속기록.
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
  exception when others then
    raise notice 'PASS: % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — expected denied', p_label;
end;
$$;

insert into auth.users(id,email) values
  ('00000291-0000-4000-8000-000000000001','unlink-admin@example.invalid'),
  ('00000291-0000-4000-8000-000000000002','unlink-member@example.invalid');
insert into public.profiles(id,name,role,email) values
  ('00000291-0000-4000-8000-000000000001','Unlink Admin','ADMIN','unlink-admin@example.invalid'),
  ('00000291-0000-4000-8000-000000000002','Unlink Member','USER','unlink-member@example.invalid');
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values
  ('2910000001','00000291-0000-4000-8000-000000000002',
   '{"sub":"2910000001","email":"unlink-member@example.invalid"}','kakao',now(),now());

-- 클라이언트는 적재 함수와 테이블에 접근할 수 없다
select pg_temp.assert(
  not has_function_privilege('anon','public.record_social_unlink(text,text,text)','execute')
  and not has_function_privilege('authenticated','public.record_social_unlink(text,text,text)','execute')
  and has_function_privilege('service_role','public.record_social_unlink(text,text,text)','execute'),
  'record_social_unlink is service_role only');
select set_config('request.jwt.claims','{"sub":"00000291-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select pg_temp.denied($q$select * from public.social_unlink_events$q$, 'member cannot read table');
select pg_temp.denied($q$select public.record_social_unlink('kakao','2910000001','UNLINK_FROM_APPS')$q$, 'member cannot record');
select pg_temp.denied($q$select public.admin_social_unlink_summary()$q$, 'member cannot read summary');
select pg_temp.denied($q$select * from public.admin_list_social_unlinks()$q$, 'member cannot list');
reset role;

-- 적재: 회원 매칭, 재전송 중복, 사유가 다르면 별도 건, 모르는 회원번호는 회원 없이 기록
set local role service_role;
select pg_temp.assert(public.record_social_unlink('kakao','2910000001','UNLINK_FROM_APPS'), 'first event recorded');
select pg_temp.assert(not public.record_social_unlink('kakao','2910000001','UNLINK_FROM_APPS'), 'retransmission ignored');
select pg_temp.assert(public.record_social_unlink('kakao','2910000001','ACCOUNT_DELETE'), 'different referrer recorded');
select pg_temp.assert(public.record_social_unlink('kakao','2919999999','UNLINK_FROM_APPS'), 'unknown member recorded');
select pg_temp.denied($q$select public.record_social_unlink('kakao','abc','UNLINK_FROM_APPS')$q$, 'non-numeric user id rejected');
select pg_temp.denied($q$select public.record_social_unlink('kakao','2910000001','SOMETHING')$q$, 'unknown referrer rejected');
select pg_temp.denied($q$select public.record_social_unlink('naver','2910000001','UNLINK_FROM_APPS')$q$, 'unsupported provider rejected');
reset role;
select pg_temp.assert(
  (select count(*) from public.social_unlink_events where provider_user_id='2910000001'
     and user_id='00000291-0000-4000-8000-000000000002') = 2,
  'events matched to member');
select pg_temp.assert(
  (select user_id is null from public.social_unlink_events where provider_user_id='2919999999'),
  'unknown member has null user_id');
-- 회원 데이터는 바꾸지 않는다
select pg_temp.assert(
  exists(select 1 from auth.identities where provider='kakao' and provider_id='2910000001')
  and (select status::text from public.profiles where id='00000291-0000-4000-8000-000000000002') = 'ACTIVE',
  'member identity and status untouched');

-- MFA 미인증 관리자는 조회할 수 없다
select set_config('request.jwt.claims','{"sub":"00000291-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","app_metadata":{"role":"ADMIN","status":"ACTIVE"}}',true);
set local role authenticated;
select pg_temp.denied($q$select * from public.admin_list_social_unlinks()$q$, 'admin without MFA cannot list');
reset role;

-- 관리자 + MFA: 요약·목록(접속기록)·처리
select set_config('request.jwt.claims','{"sub":"00000291-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","app_metadata":{"role":"ADMIN","status":"ACTIVE"}}',true);
set local role authenticated;
select pg_temp.assert(public.admin_social_unlink_summary() >= 3, 'summary counts open events');
select pg_temp.assert(
  (select member_email from public.admin_list_social_unlinks()
    where referrer_type='UNLINK_FROM_APPS' and user_id='00000291-0000-4000-8000-000000000002')
    = 'unlink-member@example.invalid',
  'list shows matched member');
select pg_temp.denied($q$select public.admin_list_social_unlinks('DONE')$q$, 'invalid status rejected');
select pg_temp.denied($q$select public.admin_resolve_social_unlink(
  (select id from public.admin_list_social_unlinks() where user_id is null limit 1),'x')$q$, 'short memo rejected');
reset role;
select pg_temp.assert(
  exists(select 1 from public.access_logs where action='SOCIAL_UNLINK_LIST'
           and actor_id='00000291-0000-4000-8000-000000000001'),
  'list writes access log');

create temp table t_ev as
  select id from public.social_unlink_events
   where provider_user_id='2910000001' and referrer_type='UNLINK_FROM_APPS' and status='OPEN';
grant select on t_ev to authenticated;
set local role authenticated;
select public.admin_resolve_social_unlink((select id from t_ev), '회원탈퇴 절차로 처리함');
select pg_temp.denied($q$select public.admin_resolve_social_unlink((select id from t_ev), '다시 처리')$q$, 'already resolved rejected');
reset role;
select pg_temp.assert(
  (select status='RESOLVED' and resolved_by='00000291-0000-4000-8000-000000000001' and resolved_at is not null
     from public.social_unlink_events where id=(select id from t_ev)),
  'resolved with actor and time');
select pg_temp.assert(
  exists(select 1 from public.access_logs where action='SOCIAL_UNLINK_RESOLVE'
           and target_id=(select id from t_ev) and subject_id='00000291-0000-4000-8000-000000000002'),
  'resolve writes access log with member');

-- 처리 완료 뒤 같은 사유가 다시 오면 새 미처리 건이 된다
set local role service_role;
select pg_temp.assert(public.record_social_unlink('kakao','2910000001','UNLINK_FROM_APPS'), 'new event after resolve');
reset role;

rollback;

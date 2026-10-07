-- 귀책 보상 포인트 관리자 지급 (#250) — 권한·MFA·상한·중복 확인·회수·감사 기록.
-- 2026-10-07 운영 보류(마이그레이션 97): 먼저 아무도 실행할 수 없음을 확인하고,
-- 이 트랜잭션 안에서만 권한을 되돌려 함수 동작을 검증한다(rollback 으로 원복).
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

-- 보류: anon·authenticated 모두 관리자 보상 함수를 실행할 수 없다
select pg_temp.assert(
  not has_function_privilege('authenticated','public.admin_compensation_target(text)','execute')
  and not has_function_privilege('authenticated','public.admin_grant_compensation(uuid,text,integer,text,text,boolean)','execute')
  and not has_function_privilege('authenticated','public.admin_revoke_compensation(uuid,text)','execute')
  and not has_function_privilege('authenticated','public.admin_list_compensations(integer)','execute')
  and not has_function_privilege('anon','public.admin_grant_compensation(uuid,text,integer,text,text,boolean)','execute'),
  'on hold: compensation functions not executable by clients');

grant execute on function public.admin_compensation_target(text) to authenticated;
grant execute on function public.admin_grant_compensation(uuid,text,integer,text,text,boolean) to authenticated;
grant execute on function public.admin_revoke_compensation(uuid,text) to authenticated;
grant execute on function public.admin_list_compensations(integer) to authenticated;

insert into auth.users(id,email) values
  ('00000250-0000-4000-8000-000000000001','comp-admin@example.invalid'),
  ('00000250-0000-4000-8000-000000000002','comp-user@example.invalid'),
  ('00000250-0000-4000-8000-000000000003','comp-partner@example.invalid');
insert into public.profiles(id,name,role) values
  ('00000250-0000-4000-8000-000000000001','Comp Admin','ADMIN'),
  ('00000250-0000-4000-8000-000000000002','Comp User','USER'),
  ('00000250-0000-4000-8000-000000000003','Comp Partner','PARTNER');
insert into public.admin_accounts(profile_id,duty) values ('00000250-0000-4000-8000-000000000001','정산');

insert into public.reservations(id, code, customer_id, status, plan, use_date, arrive_time, reserve_time,
                                duration, duration_minutes, hospital_address, confirmed_partner_id)
values
  ('00000250-0000-4000-8000-000000000010','TEST-COMP-250','00000250-0000-4000-8000-000000000002','CANCELLED',
   'basic','2099-01-01','09:00','09:30','2시간',120,'Test','00000250-0000-4000-8000-000000000003'),
  ('00000250-0000-4000-8000-000000000011','TEST-COMP-250-M','00000250-0000-4000-8000-000000000002','MATCHING',
   'basic','2099-01-01','09:00','09:30','2시간',120,'Test',null);

-- 고객·파트너·MFA 미인증 관리자는 실행할 수 없다
select set_config('request.jwt.claims','{"sub":"00000250-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_NO_SHOW',5000,'파트너 노쇼 보상','CS-001')$q$, 'customer cannot grant');
select pg_temp.denied($q$select * from public.point_compensations$q$, 'customer cannot read table');
reset role;

select set_config('request.jwt.claims','{"sub":"00000250-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_NO_SHOW',5000,'파트너 노쇼 보상','CS-001')$q$, 'admin without MFA cannot grant');
reset role;

update public.admin_accounts set duty='계정' where profile_id='00000250-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"00000250-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_NO_SHOW',5000,'파트너 노쇼 보상','CS-001')$q$, 'account duty cannot grant');
reset role;
update public.admin_accounts set duty='정산' where profile_id='00000250-0000-4000-8000-000000000001';

-- 정산 담당 + MFA
set local role authenticated;
select pg_temp.assert((select code from public.admin_compensation_target('TEST-COMP-250')) = 'TEST-COMP-250', 'target lookup by code');
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_NO_SHOW',100001,'파트너 노쇼 보상','CS-001')$q$, 'over 100,000P rejected');
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_NO_SHOW',0,'파트너 노쇼 보상','CS-001')$q$, 'zero rejected');
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','OTHER',5000,'파트너 노쇼 보상','CS-001')$q$, 'unknown kind rejected');
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_NO_SHOW',5000,'짧음','CS-001')$q$, 'short reason rejected');
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_NO_SHOW',5000,'파트너 노쇼 보상','')$q$, 'evidence required');
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000011','PARTNER_NO_SHOW',5000,'파트너 노쇼 보상','CS-001')$q$, 'matching reservation not eligible');

create temp table t_ids(seq serial, id uuid);
grant all on t_ids to authenticated;
grant usage on sequence t_ids_seq_seq to authenticated;
insert into t_ids(id) select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_NO_SHOW',100000,'파트너 노쇼 보상','CS-001');
select pg_temp.denied($q$select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_LATE',3000,'추가 보상 요청','CS-002')$q$, 'duplicate needs explicit confirmation');
insert into t_ids(id) select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_LATE',3000,'추가 보상 요청','CS-002', true);
select pg_temp.assert((select count(*) from public.admin_list_compensations()) >= 2, 'history lists grants');
reset role;

select pg_temp.assert(public.point_balance('00000250-0000-4000-8000-000000000002') = 103000, 'customer balance increased');
select pg_temp.assert((select count(*) from public.points where user_id='00000250-0000-4000-8000-000000000002' and reason='COMPENSATION' and amount>0 and expires_at is null) = 2, 'COMPENSATION rows without expiry');
select pg_temp.assert((select count(*) from public.notifications where recipient_id='00000250-0000-4000-8000-000000000002' and type='POINT_COMPENSATED') = 2, 'customer notified per grant');
select pg_temp.assert((select count(*) from public.access_logs where actor_id='00000250-0000-4000-8000-000000000001' and action='COMPENSATION_GRANT') = 2, 'grant audited');
select pg_temp.assert(not exists(select 1 from public.settlements s join public.services sv on sv.id=s.service_id where sv.reservation_id='00000250-0000-4000-8000-000000000010'), 'partner settlement untouched');

-- 회수 (#252 리뷰) — 지급 이후 사용분은 그 보상분에서 먼저 쓴 것으로 본다.
-- 기존 적립 10,000P 는 어떤 회수에서도 줄지 않아야 한다.
-- 한 트랜잭션이라 now() 가 같으므로 created_at 을 직접 지정해 순서를 만든다.
insert into public.points(user_id, amount, reason, memo, created_at)
values ('00000250-0000-4000-8000-000000000002', 10000, 'EARN_PAYMENT', 'test earn', now() - interval '1 hour');
insert into public.points(user_id, amount, reason, memo, created_at)
values ('00000250-0000-4000-8000-000000000002', -98000, 'USE', 'test use', now() + interval '1 minute');
select pg_temp.assert(public.point_balance('00000250-0000-4000-8000-000000000002') = 15000, 'balance after use');

select set_config('request.jwt.claims','{"sub":"00000250-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select pg_temp.assert(public.admin_revoke_compensation((select id from t_ids where seq=1), '잘못 지급되어 회수') = 2000, 'revoke only unused part of this grant (100,000 - 98,000)');
select pg_temp.denied($q$select public.admin_revoke_compensation((select id from t_ids where seq=1), '잘못 지급되어 회수')$q$, 'cannot revoke twice');
select pg_temp.assert(public.admin_revoke_compensation((select id from t_ids where seq=2), '잘못 지급되어 회수') = 0, 'used grant records zero, other grant balance not taken');
reset role;
select pg_temp.assert(public.point_balance('00000250-0000-4000-8000-000000000002') = 13000, 'earned and other grant points untouched');

-- 사용 이후에 지급된 보상은 전액 회수된다
set local role authenticated;
insert into t_ids(id) select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','NOT_PROVIDED',5000,'서비스 미제공 보상','CS-003', true);
reset role;
update public.points set created_at = now() + interval '5 minutes'
 where id = (select point_id from public.point_compensations where id = (select id from t_ids where seq=3));
set local role authenticated;
select pg_temp.assert(public.admin_revoke_compensation((select id from t_ids where seq=3), '잘못 지급되어 회수') = 5000, 'grant after earlier use fully revocable');
reset role;
select pg_temp.assert(public.point_balance('00000250-0000-4000-8000-000000000002') = 13000, 'balance back to before grant');

-- 리뷰 사례: 적립분이 있는 상태에서 보상 5,000P 지급 → 5,000P 사용 → 회수 0P, 적립분 유지
set local role authenticated;
insert into t_ids(id) select public.admin_grant_compensation('00000250-0000-4000-8000-000000000010','PARTNER_LATE',5000,'지각 보상 지급','CS-004', true);
reset role;
update public.points set created_at = now() + interval '10 minutes'
 where id = (select point_id from public.point_compensations where id = (select id from t_ids where seq=4));
insert into public.points(user_id, amount, reason, memo, created_at)
values ('00000250-0000-4000-8000-000000000002', -5000, 'USE', 'test use', now() + interval '11 minutes');
set local role authenticated;
select pg_temp.assert(public.admin_revoke_compensation((select id from t_ids where seq=4), '잘못 지급되어 회수') = 0, 'grant spent after issue is not revoked');
reset role;
select pg_temp.assert(public.point_balance('00000250-0000-4000-8000-000000000002') = 13000, 'earned points not reduced by revoke');

select pg_temp.assert((select count(*) from public.point_compensations where customer_id='00000250-0000-4000-8000-000000000002' and revoked_at is not null) = 4, 'all marked revoked');
select pg_temp.assert((select count(*) from public.access_logs where actor_id='00000250-0000-4000-8000-000000000001' and action='COMPENSATION_REVOKE') = 4, 'revoke audited');

rollback;

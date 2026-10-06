-- 귀책 보상 포인트 관리자 지급 (#250) — 권한·MFA·상한·중복 확인·회수·감사 기록.
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

-- 고객이 일부를 사용한 뒤 회수 → 남은 잔액만큼만
insert into public.points(user_id, amount, reason, memo) values ('00000250-0000-4000-8000-000000000002', -101000, 'USE', 'test use');
select pg_temp.assert(public.point_balance('00000250-0000-4000-8000-000000000002') = 2000, 'balance after use');

select set_config('request.jwt.claims','{"sub":"00000250-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select pg_temp.assert(public.admin_revoke_compensation((select id from t_ids where seq=1), '잘못 지급되어 회수') = 2000, 'revoke only remaining balance');
select pg_temp.denied($q$select public.admin_revoke_compensation((select id from t_ids where seq=1), '잘못 지급되어 회수')$q$, 'cannot revoke twice');
select pg_temp.assert(public.admin_revoke_compensation((select id from t_ids where seq=2), '잘못 지급되어 회수') = 0, 'nothing left to revoke records zero');
reset role;

select pg_temp.assert(public.point_balance('00000250-0000-4000-8000-000000000002') = 0, 'balance never negative after revoke');
select pg_temp.assert((select count(*) from public.point_compensations where customer_id='00000250-0000-4000-8000-000000000002' and revoked_at is not null) = 2, 'both marked revoked');
select pg_temp.assert((select count(*) from public.access_logs where actor_id='00000250-0000-4000-8000-000000000001' and action='COMPENSATION_REVOKE') = 2, 'revoke audited');

rollback;

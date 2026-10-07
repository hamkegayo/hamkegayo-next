-- 파트너 새 요청 알림 + 알림 설정 (#255-4). 지역·요일 구분 시간이 맞는 활성 파트너에게만, 1회, 이메일 설정 반영.
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

select pg_temp.assert(not has_function_privilege('authenticated','public.notify_partners_new_request(uuid,text,text,text)','execute')
                      and not has_function_privilege('anon','public.notify_partners_new_request(uuid,text,text,text)','execute'),
                      'notify is server-only');

-- 파트너: P1 강남구·평일 09-18 / P2 종로구 / P3 강남구지만 정지 / P4 강남구·평일 시간 미설정 / P5 지역 미설정
insert into auth.users(id,email) values
  ('00000256-0000-4000-8000-000000000001','alert-p1@example.invalid'),
  ('00000256-0000-4000-8000-000000000002','alert-p2@example.invalid'),
  ('00000256-0000-4000-8000-000000000003','alert-p3@example.invalid'),
  ('00000256-0000-4000-8000-000000000004','alert-p4@example.invalid'),
  ('00000256-0000-4000-8000-000000000005','alert-p5@example.invalid'),
  ('00000256-0000-4000-8000-000000000009','alert-user@example.invalid');
insert into public.profiles(id,name,role,status,email) values
  ('00000256-0000-4000-8000-000000000001','Alert P1','PARTNER','ACTIVE','alert-p1@example.invalid'),
  ('00000256-0000-4000-8000-000000000002','Alert P2','PARTNER','ACTIVE','alert-p2@example.invalid'),
  ('00000256-0000-4000-8000-000000000003','Alert P3','PARTNER','SUSPENDED','alert-p3@example.invalid'),
  ('00000256-0000-4000-8000-000000000004','Alert P4','PARTNER','ACTIVE','alert-p4@example.invalid'),
  ('00000256-0000-4000-8000-000000000005','Alert P5','PARTNER','ACTIVE','alert-p5@example.invalid'),
  ('00000256-0000-4000-8000-000000000009','Alert User','USER','ACTIVE','alert-user@example.invalid');
insert into public.partner_accounts(profile_id,login_id) values
  ('00000256-0000-4000-8000-000000000001','alert-p1'),
  ('00000256-0000-4000-8000-000000000002','alert-p2'),
  ('00000256-0000-4000-8000-000000000003','alert-p3'),
  ('00000256-0000-4000-8000-000000000004','alert-p4'),
  ('00000256-0000-4000-8000-000000000005','alert-p5');
insert into public.partner_activity_profiles(partner_id, regions, weekday_start, weekday_end, saturday_start, saturday_end) values
  ('00000256-0000-4000-8000-000000000001', array['1168000000'], '09:00', '18:00', null, null),
  ('00000256-0000-4000-8000-000000000002', array['1111000000'], '09:00', '18:00', null, null),
  ('00000256-0000-4000-8000-000000000003', array['1168000000'], '09:00', '18:00', null, null),
  ('00000256-0000-4000-8000-000000000004', array['1168000000'], null, null, '09:00', '18:00'),
  ('00000256-0000-4000-8000-000000000005', array[]::text[], '09:00', '18:00', null, null);

insert into public.reservations(id, code, customer_id, status, plan, use_date, arrive_time, reserve_time,
                                duration, duration_minutes, hospital_address, hospital_region_code, depart_address)
values
  ('00000256-0000-4000-8000-000000000101','TEST-ALERT-1','00000256-0000-4000-8000-000000000009','MATCHING',
   'basic','2099-01-05','10시 00분','10시 30분','2시간',120,'서울특별시 강남구 테헤란로 1','1168000000','서울특별시 강남구 역삼동'),
  ('00000256-0000-4000-8000-000000000102','TEST-ALERT-2','00000256-0000-4000-8000-000000000009','MATCHING',
   'basic','2099-01-05','20시 00분','20시 30분','2시간',120,'서울특별시 강남구 테헤란로 1','1168000000','서울특별시 강남구 역삼동'),
  ('00000256-0000-4000-8000-000000000103','TEST-ALERT-3','00000256-0000-4000-8000-000000000009','CANCELLED',
   'basic','2099-01-05','10:00','10:30','2시간',120,'서울특별시 강남구 테헤란로 1','1168000000','서울특별시 강남구 역삼동');

-- P1 은 이메일을 끈다
select set_config('request.jwt.claims','{"sub":"00000256-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"PARTNER"}}',true);
set local role authenticated;
select public.set_my_partner_notification_prefs(false);
select pg_temp.assert((select email_new_request from public.partner_notification_prefs) = false, 'partner can turn email off');
reset role;
select set_config('request.jwt.claims','{"sub":"00000256-0000-4000-8000-000000000009","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.set_my_partner_notification_prefs(true)$q$, 'customer cannot set partner prefs');
reset role;

create temp table t_mail as
  select * from public.notify_partners_new_request('00000256-0000-4000-8000-000000000101','WEEKDAY','새 동행 요청','01월 05일 10:00 · Basic');

select pg_temp.assert(exists(select 1 from public.notifications where recipient_id='00000256-0000-4000-8000-000000000001'
                        and type='NEW_REQUEST' and link='/partner/requests/00000256-0000-4000-8000-000000000101'),
                      'region+weekday match gets in-app alert');
select pg_temp.assert(not exists(select 1 from public.notifications where type='NEW_REQUEST'
                        and recipient_id in ('00000256-0000-4000-8000-000000000002','00000256-0000-4000-8000-000000000003',
                                             '00000256-0000-4000-8000-000000000004','00000256-0000-4000-8000-000000000005')),
                      'other region, suspended, no weekday hours, no regions: no alert');
select pg_temp.assert((select count(*) from t_mail) = 0, 'email off partner not returned for email');

-- 이메일 켜면 주소가 돌아온다(새 예약 기준). 같은 예약은 다시 보내지 않는다.
update public.partner_notification_prefs set email_new_request = true where partner_id='00000256-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.notify_partners_new_request('00000256-0000-4000-8000-000000000101','WEEKDAY','새 동행 요청','x')) = 0,
                      'same reservation not re-notified');
select pg_temp.assert((select count(*) from public.notifications where type='NEW_REQUEST'
                        and recipient_id='00000256-0000-4000-8000-000000000001') = 1, 'single alert per reservation');

-- 시간 밖(20:00)·취소된 예약은 보내지 않는다
select pg_temp.assert((select count(*) from public.notify_partners_new_request('00000256-0000-4000-8000-000000000102','WEEKDAY','t','b')) = 0
                      and not exists(select 1 from public.notifications where link like '%000000000102'),
                      'outside available hours: no alert');
select pg_temp.assert((select count(*) from public.notify_partners_new_request('00000256-0000-4000-8000-000000000103','WEEKDAY','t','b')) = 0,
                      'non-matching reservation: no alert');

-- 토요일 구분이면 토요일 시간만 본다 → P4
delete from public.notifications where type='NEW_REQUEST';
create temp table t_mail2 as
  select * from public.notify_partners_new_request('00000256-0000-4000-8000-000000000101','SATURDAY','t','b');
select pg_temp.assert((select array_agg(partner_id::text) from t_mail2) = array['00000256-0000-4000-8000-000000000004'],
                      'saturday window: P4 alerted with email (default on)');
select pg_temp.denied($q$select public.notify_partners_new_request('00000256-0000-4000-8000-000000000101','SUNDAY','t','b')$q$, 'invalid day kind rejected');

rollback;

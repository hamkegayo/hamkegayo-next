-- 파트너 교육 이수 기록 + 미이수 수락 차단 (#255-3, 매뉴얼 10장).
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
create function pg_temp.as_partner(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"'||p_id||'","role":"authenticated","app_metadata":{"role":"PARTNER"}}', true);
$$;
create function pg_temp.as_admin(p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"00000255-0000-4000-8000-000000000001","role":"authenticated","aal":"'||p_aal||'"}', true);
$$;

insert into auth.users(id,email) values
  ('00000255-0000-4000-8000-000000000001','train-admin@example.invalid'),
  ('00000255-0000-4000-8000-000000000002','train-p1@example.invalid'),
  ('00000255-0000-4000-8000-000000000003','train-p2@example.invalid'),
  ('00000255-0000-4000-8000-000000000004','train-user@example.invalid');
insert into public.profiles(id,name,role) values
  ('00000255-0000-4000-8000-000000000001','Train Admin','ADMIN'),
  ('00000255-0000-4000-8000-000000000002','Train P1','PARTNER'),
  ('00000255-0000-4000-8000-000000000003','Train P2','PARTNER'),
  ('00000255-0000-4000-8000-000000000004','Train User','USER');
insert into public.admin_accounts(profile_id,duty) values ('00000255-0000-4000-8000-000000000001','심사');
insert into public.partner_accounts(profile_id,login_id) values
  ('00000255-0000-4000-8000-000000000002','train-p1'),
  ('00000255-0000-4000-8000-000000000003','train-p2');
insert into public.reservations(id, code, customer_id, status, plan, use_date, arrive_time, reserve_time,
                                duration, duration_minutes, hospital_address)
values
  ('00000255-0000-4000-8000-000000000101','TEST-TRAIN-1','00000255-0000-4000-8000-000000000004','MATCHING',
   'basic','2099-01-01','09:00','09:30','2시간',120,'Test'),
  ('00000255-0000-4000-8000-000000000102','TEST-TRAIN-2','00000255-0000-4000-8000-000000000004','MATCHING',
   'basic','2099-01-01','09:00','09:30','2시간',120,'Test'),
  ('00000255-0000-4000-8000-000000000103','TEST-TRAIN-3','00000255-0000-4000-8000-000000000004','MATCHING',
   'basic','2099-01-01','09:00','09:30','2시간',120,'Test');

select pg_temp.assert(public.partner_training_required() = false, 'enforcement off by default');
select pg_temp.assert(not has_function_privilege('authenticated','public.partner_training_complete(uuid)','execute'),
                      'completeness check is internal');

-- 권한: 파트너·MFA 미인증 관리자는 기록할 수 없다
select pg_temp.as_partner('00000255-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.denied($q$select public.admin_record_partner_training('00000255-0000-4000-8000-000000000002','BASIC',current_date,'CERT-1')$q$, 'partner cannot record');
reset role;
select pg_temp.as_admin('aal1');
set local role authenticated;
select pg_temp.denied($q$select public.admin_record_partner_training('00000255-0000-4000-8000-000000000002','BASIC',current_date,'CERT-1')$q$, 'admin without MFA cannot record');
reset role;

-- 스위치 꺼짐: 미이수 파트너도 수락할 수 있다(기존 운영 유지)
select pg_temp.as_partner('00000255-0000-4000-8000-000000000003');
set local role authenticated;
insert into public.reservation_applications(reservation_id, partner_id, status)
values ('00000255-0000-4000-8000-000000000101','00000255-0000-4000-8000-000000000003','ACCEPTED');
reset role;
select pg_temp.assert(exists(select 1 from public.reservation_applications
  where reservation_id='00000255-0000-4000-8000-000000000101' and partner_id='00000255-0000-4000-8000-000000000003'),
  'enforcement off: untrained partner can accept');

-- 심사 담당 + MFA 기록
select pg_temp.as_admin();
set local role authenticated;
select pg_temp.denied($q$select public.admin_record_partner_training('00000255-0000-4000-8000-000000000002','OTHER',current_date,'CERT-1')$q$, 'unknown course rejected');
select pg_temp.denied($q$select public.admin_record_partner_training('00000255-0000-4000-8000-000000000002','BASIC',current_date + 1,'CERT-1')$q$, 'future date rejected');
select pg_temp.denied($q$select public.admin_record_partner_training('00000255-0000-4000-8000-000000000002','BASIC',current_date,'')$q$, 'evidence required');
select public.admin_record_partner_training('00000255-0000-4000-8000-000000000002','BASIC',current_date,'CERT-1');
select public.admin_record_partner_training('00000255-0000-4000-8000-000000000002','EMERGENCY',current_date,'CERT-2');
select public.admin_record_partner_training('00000255-0000-4000-8000-000000000002','PRIVACY',current_date,'CERT-3');
select pg_temp.assert((select count(*) from public.admin_list_partner_trainings()
                        where partner_id='00000255-0000-4000-8000-000000000002'
                          and courses ? 'BASIC' and courses ? 'EMERGENCY' and courses ? 'PRIVACY') = 1,
                      'admin list shows three courses');
reset role;

-- 파트너는 본인 기록만
select pg_temp.as_partner('00000255-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.assert((select count(*) from public.partner_trainings) = 3, 'partner sees own records');
reset role;
select pg_temp.as_partner('00000255-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.assert((select count(*) from public.partner_trainings) = 0, 'other partner sees nothing');
reset role;

-- 스위치 켬
update public.partner_training_enforcement set enabled = true where id;

select pg_temp.as_partner('00000255-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.denied($q$insert into public.reservation_applications(reservation_id, partner_id, status)
  values ('00000255-0000-4000-8000-000000000102','00000255-0000-4000-8000-000000000003','ACCEPTED')$q$,
  'enforcement on: untrained partner cannot accept');
insert into public.reservation_applications(reservation_id, partner_id, status, reject_reason)
values ('00000255-0000-4000-8000-000000000103','00000255-0000-4000-8000-000000000003','REJECTED','time');
select pg_temp.denied($q$update public.reservation_applications set status='ACCEPTED'
  where reservation_id='00000255-0000-4000-8000-000000000103' and partner_id='00000255-0000-4000-8000-000000000003'$q$,
  'enforcement on: rejected cannot be flipped to accepted');
reset role;
select pg_temp.assert(exists(select 1 from public.reservation_applications
  where reservation_id='00000255-0000-4000-8000-000000000103' and status='REJECTED'), 'rejection still allowed');

select pg_temp.as_partner('00000255-0000-4000-8000-000000000002');
set local role authenticated;
insert into public.reservation_applications(reservation_id, partner_id, status)
values ('00000255-0000-4000-8000-000000000102','00000255-0000-4000-8000-000000000002','ACCEPTED');
reset role;
select pg_temp.assert(exists(select 1 from public.reservation_applications
  where reservation_id='00000255-0000-4000-8000-000000000102' and partner_id='00000255-0000-4000-8000-000000000002'),
  'enforcement on: trained partner can accept');

-- 기록 삭제 → 다시 미이수
select pg_temp.as_admin();
set local role authenticated;
select pg_temp.denied($q$select public.admin_clear_partner_training('00000255-0000-4000-8000-000000000002','PRIVACY','')$q$, 'clear requires reason');
select public.admin_clear_partner_training('00000255-0000-4000-8000-000000000002','PRIVACY','잘못 입력한 이수 기록');
reset role;
select pg_temp.assert(not public.partner_training_complete('00000255-0000-4000-8000-000000000002'), 'cleared course makes partner incomplete');

select pg_temp.assert((select count(*) from public.access_logs where actor_id='00000255-0000-4000-8000-000000000001'
                        and action='PARTNER_TRAINING_RECORD') = 3, 'records audited');
select pg_temp.assert((select count(*) from public.access_logs where actor_id='00000255-0000-4000-8000-000000000001'
                        and action='PARTNER_TRAINING_CLEAR') = 1, 'clear audited');

rollback;

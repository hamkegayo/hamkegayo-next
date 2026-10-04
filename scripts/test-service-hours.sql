begin;
create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end;
$$;
select pg_temp.assert(public.service_auto_close_after('2026-10-04 15:00:00+09',120) = '2026-10-04 19:00:00+09'::timestamptz, 'new KST cap 19:00, not 18:00');
select pg_temp.assert(public.service_auto_close_after('2026-10-04 07:00:00+09',120) = '2026-10-04 12:00:00+09'::timestamptz, 'early service planned end plus three hours');
select pg_temp.assert(public.service_auto_close_after('2026-10-04 17:00:00+09',120) = '2026-10-04 19:00:00+09'::timestamptz, 'planned end exactly at cap');
select pg_temp.assert(public.service_auto_close_after('2026-10-04 18:00:00+09',120) = '2026-10-04 20:00:00+09'::timestamptz, 'legacy planned end after cap protected');
select pg_temp.assert(public.service_auto_close_after('2026-10-04 08:00:00+09',null) = '2026-10-04 13:00:00+09'::timestamptz, 'legacy null duration uses 120 minutes');
set local timezone = 'UTC';
select pg_temp.assert(public.service_auto_close_after('2026-10-04 15:00:00+09',120) = '2026-10-04 10:00:00+00'::timestamptz, 'UTC session still uses KST day cap');
select pg_temp.assert(not has_function_privilege('authenticated','public.auto_close_stale_services()','execute') and not has_function_privilege('anon','public.auto_close_stale_services()','execute'), 'automatic closing server only');
select pg_temp.assert(has_function_privilege('service_role','public.auto_close_stale_services()','execute'), 'server execution allowed');
select pg_temp.assert(public.is_service_booking_time('07:00') and public.is_service_booking_time('19시 00분'), 'DB service time boundaries');
select pg_temp.assert(not public.is_service_booking_time('06:30') and not public.is_service_booking_time('19:30') and not public.is_service_booking_time('07:15') and not public.is_service_booking_time('07:00junk'), 'DB invalid service times');

insert into auth.users(id,email) values ('00000176-0000-4000-8000-000000000001', 'hours-test@example.invalid');
insert into public.profiles(id,name,role) values ('00000176-0000-4000-8000-000000000001','Hours Test','USER');
select set_config('request.jwt.claims','{"sub":"00000176-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into public.reservations(code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone, guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address, hospital_address)
values ('TEST-HOURS-176','00000176-0000-4000-8000-000000000001','basic','Test','1960-01-01','female','01000000000','Test','01000000000','self','Test','Test','2099-01-01','07:00','07:30','2시간',120,'Test','Test');
select pg_temp.assert(exists(select 1 from public.reservations where code='TEST-HOURS-176'), 'authenticated insert at opening accepted');
do $$
begin
  begin
    insert into public.reservations(code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone, guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address, hospital_address)
    values ('TEST-HOURS-176-BYPASS','00000176-0000-4000-8000-000000000001','basic','Test','1960-01-01','female','01000000000','Test','01000000000','self','Test','Test','2099-01-01','06:30','07:30','2시간',120,'Test','Test');
  exception when check_violation then
    raise notice 'PASS: direct authenticated insert outside hours rejected';
    return;
  end;
  raise exception 'FAIL: direct insert bypass';
end;
$$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000176-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare v_start text; v_minutes integer; v_rejected boolean;
begin
  for v_start, v_minutes in select * from (values ('17:00',120),('17:30',120),('16:30',150),('16:30',120),('17:00',null::integer)) as cases(start_time,minutes) loop
    v_rejected := false;
    begin
      insert into public.reservations(code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone, guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address, hospital_address)
      values ('TEST-HOURS-END-'||replace(v_start,':','')||coalesce(v_minutes::text,'NULL'),'00000176-0000-4000-8000-000000000001','basic','Test','1960-01-01','female','01000000000','Test','01000000000','self','Test','Test','2099-01-01',v_start,v_start,case when v_minutes=150 then '2시간 30분' else '2시간' end,v_minutes,'Test','Test');
    exception when check_violation then v_rejected := true;
    end;
    perform pg_temp.assert(v_rejected = (v_minutes is null or (v_start='17:30' and v_minutes=120)), 'planned end boundary '||v_start||'/'||coalesce(v_minutes::text,'NULL'));
  end loop;
end;
$$;
reset role;
rollback;

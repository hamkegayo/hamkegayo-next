-- 서비스 진행 메모 임시 저장 (#268) — 담당 파트너·열람 기간 안에서만, 메모 열만 갱신.
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

select pg_temp.assert(not has_function_privilege('anon','public.save_service_memo(uuid,text,text)','execute'), 'anon cannot save');

insert into auth.users(id,email) values
  ('00000268-0000-4000-8000-000000000001','memo-p1@example.invalid'),
  ('00000268-0000-4000-8000-000000000002','memo-p2@example.invalid'),
  ('00000268-0000-4000-8000-000000000009','memo-user@example.invalid');
insert into public.profiles(id,name,role) values
  ('00000268-0000-4000-8000-000000000001','Memo P1','PARTNER'),
  ('00000268-0000-4000-8000-000000000002','Memo P2','PARTNER'),
  ('00000268-0000-4000-8000-000000000009','Memo User','USER');

insert into public.reservations(id, code, customer_id, status, plan, use_date, arrive_time, reserve_time,
                                duration, duration_minutes, hospital_address, confirmed_partner_id)
values
  ('00000268-0000-4000-8000-000000000101','TEST-MEMO-1','00000268-0000-4000-8000-000000000009','CONFIRMED',
   'basic','2099-01-01','09:00','09:30','2시간',120,'Test','00000268-0000-4000-8000-000000000001'),
  ('00000268-0000-4000-8000-000000000102','TEST-MEMO-2','00000268-0000-4000-8000-000000000009','COMPLETED',
   'basic','2099-01-01','09:00','09:30','2시간',120,'Test','00000268-0000-4000-8000-000000000001');
insert into public.services(id, reservation_id, partner_id, status) values
  ('00000268-0000-4000-8000-000000000201','00000268-0000-4000-8000-000000000101','00000268-0000-4000-8000-000000000001','SCHEDULED');
-- 종료 후 리포트까지 제출된 건 — 열람 기간이 끝났다
insert into public.services(id, reservation_id, partner_id, status, started_at, ended_at) values
  ('00000268-0000-4000-8000-000000000202','00000268-0000-4000-8000-000000000102','00000268-0000-4000-8000-000000000001','COMPLETED',
   now() - interval '3 hours', now() - interval '1 hour');
insert into public.reports(service_id, partner_id, status, submitted_at)
values ('00000268-0000-4000-8000-000000000202','00000268-0000-4000-8000-000000000001','SUBMITTED', now());

-- 담당 파트너: 시작 전에도 시작 메모 저장, 종료 메모는 거절
select pg_temp.as_partner('00000268-0000-4000-8000-000000000001');
set local role authenticated;
select public.save_service_memo('00000268-0000-4000-8000-000000000201','START','  휠체어 필요  ');
select pg_temp.denied($q$select public.save_service_memo('00000268-0000-4000-8000-000000000201','END','종료 메모')$q$, 'end memo before start rejected');
select pg_temp.denied($q$select public.save_service_memo('00000268-0000-4000-8000-000000000201','OTHER','x')$q$, 'unknown kind rejected');
select pg_temp.denied($q$select public.save_service_memo('00000268-0000-4000-8000-000000000201','START', repeat('가', 1001))$q$, 'over 1000 chars rejected');
select pg_temp.denied($q$select public.save_service_memo('00000268-0000-4000-8000-000000000202','START','기간 지난 메모')$q$, 'after report submitted: access expired');
reset role;
select pg_temp.assert((select start_memo from public.services where id='00000268-0000-4000-8000-000000000201') = '휠체어 필요',
                      'start memo saved (trimmed)');

-- 다른 파트너는 저장할 수 없다
select pg_temp.as_partner('00000268-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.denied($q$select public.save_service_memo('00000268-0000-4000-8000-000000000201','START','남의 메모')$q$, 'other partner cannot save');
reset role;

-- 시작 후 종료 메모 저장, 빈 값은 NULL. 상태·시각은 그대로
update public.services set status='IN_PROGRESS', started_at = now() - interval '30 minutes'
 where id='00000268-0000-4000-8000-000000000201';
select pg_temp.as_partner('00000268-0000-4000-8000-000000000001');
set local role authenticated;
select public.save_service_memo('00000268-0000-4000-8000-000000000201','END','진료 대기 중');
select public.save_service_memo('00000268-0000-4000-8000-000000000201','START','   ');
reset role;
select pg_temp.assert((select end_memo from public.services where id='00000268-0000-4000-8000-000000000201') = '진료 대기 중'
                      and (select start_memo from public.services where id='00000268-0000-4000-8000-000000000201') is null,
                      'end memo saved after start, blank start memo cleared');
select pg_temp.assert((select status::text from public.services where id='00000268-0000-4000-8000-000000000201') = 'IN_PROGRESS'
                      and (select ended_at from public.services where id='00000268-0000-4000-8000-000000000201') is null,
                      'status and times untouched');

-- 파기된 서비스는 쓰지 않는다
update public.services set sensitive_data_purged_at = now() where id='00000268-0000-4000-8000-000000000201';
select pg_temp.as_partner('00000268-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.denied($q$select public.save_service_memo('00000268-0000-4000-8000-000000000201','START','되살리기')$q$, 'purged service rejected');
reset role;

rollback;

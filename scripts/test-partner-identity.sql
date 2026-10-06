-- #226 파트너 생년월일 본인확인. Transaction-local fixtures; always rolled back.
begin;
update public.partner_identity_release set enabled = false;
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
  exception when insufficient_privilege then
    raise notice 'PASS: %', p_label;
    return;
  end;
  raise exception 'FAIL: %', p_label;
end;
$$;
create function pg_temp.invalid(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when invalid_parameter_value then
    raise notice 'PASS: %', p_label;
    return;
  end;
  raise exception 'FAIL: %', p_label;
end;
$$;
grant execute on function pg_temp.assert(boolean,text), pg_temp.denied(text,text), pg_temp.invalid(text,text) to authenticated;
insert into auth.users(id, email, raw_app_meta_data) values
('00000226-0000-4000-8000-000000000301', 'identity-partner@example.invalid', '{}'),
('00000226-0000-4000-8000-000000000302', 'identity-other@example.invalid', '{}'),
('00000226-0000-4000-8000-000000000303', 'identity-admin@example.invalid', '{}');
insert into public.profiles(id, name, role) values
('00000226-0000-4000-8000-000000000301', 'Identity Partner', 'PARTNER'),
('00000226-0000-4000-8000-000000000302', 'Identity Other', 'PARTNER'),
('00000226-0000-4000-8000-000000000303', 'Identity Admin', 'ADMIN');
insert into public.partner_accounts(profile_id, login_id) values
('00000226-0000-4000-8000-000000000301', 'identity-test-226'),
('00000226-0000-4000-8000-000000000302', 'identity-other-226');
insert into public.admin_accounts(profile_id, duty) values ('00000226-0000-4000-8000-000000000303', '심사');

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000301","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
-- 처리방침 개정 시행 전: 수집하지 않는다
select pg_temp.denied($q$select public.submit_partner_birth_date('1990-03-15')$q$, 'collection blocked before release');
select pg_temp.denied('update public.partner_identity_release set enabled = true', 'partner cannot open collection');
reset role;

update public.partner_identity_release set enabled = true;
set local role authenticated;
select pg_temp.invalid($q$select public.submit_partner_birth_date('2099-01-01')$q$, 'future date rejected');
select pg_temp.invalid($q$select public.submit_partner_birth_date((now() - interval '17 years')::date)$q$, 'under 18 rejected');
select pg_temp.invalid($q$select public.submit_partner_birth_date('1899-12-31')$q$, 'implausible date rejected');
select pg_temp.denied($q$insert into public.partner_identity_checks(partner_id, birth_date, status) values (auth.uid(), '1990-03-15', 'VERIFIED')$q$, 'self verification denied');
select public.submit_partner_birth_date('1990-03-15');
select pg_temp.assert((select status = 'PENDING' and birth_date = '1990-03-15' and purge_after > now() + interval '29 days' from public.partner_identity_checks), 'pending with 30 day purge');
select pg_temp.denied($q$select public.admin_decide_partner_identity(auth.uid(), true, '증빙 대조')$q$, 'partner cannot decide');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000302","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.partner_identity_checks), 'other partner cannot read');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000303","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.partner_identity_checks), 'reviewer without MFA cannot read');
select pg_temp.denied($q$select public.admin_decide_partner_identity('00000226-0000-4000-8000-000000000301', true, '증빙 대조')$q$, 'reviewer without MFA cannot decide');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000303","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.assert((select birth_date = '1990-03-15' from public.partner_identity_checks where partner_id = '00000226-0000-4000-8000-000000000301'), 'reviewer with MFA reads pending birth date');
select public.admin_decide_partner_identity('00000226-0000-4000-8000-000000000301', true, '면허증 생년월일과 일치');
select pg_temp.assert((select status = 'VERIFIED' and birth_date is null and decided_by = '00000226-0000-4000-8000-000000000303' from public.partner_identity_checks where partner_id = '00000226-0000-4000-8000-000000000301'), 'decision purges birth date immediately');
reset role;
select pg_temp.assert(exists(select 1 from public.access_logs where action = 'PARTNER_IDENTITY_REVIEW' and target_id = '00000226-0000-4000-8000-000000000301'), 'decision audit log');
select pg_temp.assert(exists(select 1 from public.notifications where recipient_id = '00000226-0000-4000-8000-000000000301' and type = 'PARTNER_IDENTITY_REVIEW'), 'decision notification');

select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000301","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.invalid($q$select public.submit_partner_birth_date('1990-03-15')$q$, 'verified partner cannot resubmit');
reset role;

-- 30일 지난 미처리 건 자동 파기
select set_config('request.jwt.claims', '{"sub":"00000226-0000-4000-8000-000000000302","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select public.submit_partner_birth_date('1985-07-01');
reset role;
update public.partner_identity_checks set purge_after = now() - interval '1 second' where partner_id = '00000226-0000-4000-8000-000000000302';
select pg_temp.assert(public.purge_expired_partner_birth_dates() = 1, 'purge counts expired');
select pg_temp.assert((select status = 'EXPIRED' and birth_date is null from public.partner_identity_checks where partner_id = '00000226-0000-4000-8000-000000000302'), 'expired birth date purged');
select pg_temp.assert(exists(select 1 from cron.job where jobname = 'partner-birth-date-purge'), 'daily purge scheduled');

-- 고객 상세 응답에는 생년월일 키가 없다 (공개 고지)
select pg_temp.assert(position('birth' in pg_get_functiondef('public.get_reservation_partner_detail_unreleased(uuid,uuid)'::regprocedure)) = 0, 'customer detail never reads birth date');

delete from public.partner_accounts where profile_id = '00000226-0000-4000-8000-000000000301';
select pg_temp.assert(not exists(select 1 from public.partner_identity_checks where partner_id = '00000226-0000-4000-8000-000000000301'), 'account deletion removes identity check');
rollback;

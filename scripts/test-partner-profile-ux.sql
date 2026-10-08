-- #278. 트랜잭션 안의 전용 fixture만 사용하고 모두 롤백한다.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.denied(sql text,label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when insufficient_privilege or invalid_parameter_value then raise notice 'PASS: %',label; return; end;
  raise exception 'FAIL: %',label;
end $$;
grant execute on function pg_temp.assert(boolean,text),pg_temp.denied(text,text) to anon,authenticated;
insert into auth.users(id,email) values
('00000278-0000-4000-8000-000000000001','profile-278@example.invalid'),
('00000278-0000-4000-8000-000000000002','other-278@example.invalid');
insert into public.profiles(id,name,role) values
('00000278-0000-4000-8000-000000000001','Profile fixture','PARTNER'),
('00000278-0000-4000-8000-000000000002','Other fixture','USER');
insert into public.partner_accounts(profile_id,login_id,intro) values
('00000278-0000-4000-8000-000000000001','profile-ux-278','old intro');
insert into public.partner_qualifications(id,partner_id,type,status,path,filename,size) values
('00000278-0000-4000-8000-000000000010','00000278-0000-4000-8000-000000000001','unreviewed','PENDING','278/unreviewed.pdf','unreviewed.pdf',1),
('00000278-0000-4000-8000-000000000011','00000278-0000-4000-8000-000000000001','reviewed','VERIFIED','278/reviewed.pdf','reviewed.pdf',1),
('00000278-0000-4000-8000-000000000012','00000278-0000-4000-8000-000000000001','appeal','PENDING','278/appeal.pdf','appeal.pdf',1);
insert into public.partner_evidence_retention(kind,item_id,partner_id,notified_at,expires_at,appeal_open) values
('QUALIFICATION','00000278-0000-4000-8000-000000000012','00000278-0000-4000-8000-000000000001',now(),now()+interval '30 days',true);
insert into public.partner_evidence_files(partner_id,qualification_id,path,filename,size) values
('00000278-0000-4000-8000-000000000001','00000278-0000-4000-8000-000000000010','278/extra-a.pdf','extra-a.pdf',1),
('00000278-0000-4000-8000-000000000001','00000278-0000-4000-8000-000000000010','278/extra-b.pdf','extra-b.pdf',1);
insert into public.partner_work_histories(id,partner_id,hospital,period,department,duties,status) values
('00000278-0000-4000-8000-000000000013','00000278-0000-4000-8000-000000000001','fixture','period','department','duties','PENDING'),
('00000278-0000-4000-8000-000000000014','00000278-0000-4000-8000-000000000001','reviewed','period','department','duties','VERIFIED');
set local role anon;
select pg_temp.denied($q$select public.save_partner_profile('intro',null)$q$,'anonymous profile save blocked');
select pg_temp.denied($q$select public.withdraw_partner_evidence('00000278-0000-4000-8000-000000000010','QUALIFICATION')$q$,'anonymous withdrawal blocked');
reset role;
select set_config('request.jwt.claims','{"sub":"00000278-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.save_partner_profile('intro',null)$q$,'customer cannot save partner profile');
select pg_temp.denied($q$select public.withdraw_partner_evidence('00000278-0000-4000-8000-000000000010','QUALIFICATION')$q$,'other account cannot withdraw evidence');
reset role;
select set_config('request.jwt.claims','{"sub":"00000278-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.save_partner_profile('new intro','{"regions":[],"times":{"weekday":["09:00","18:00"],"saturday":null,"holiday":null},"transports":[],"mobility":[],"hospitals":[]}');
select pg_temp.assert((select intro='new intro' from public.partner_accounts where profile_id=auth.uid()),'intro saved');
select pg_temp.assert((select weekday_start='09:00'::time from public.partner_activity_profiles where partner_id=auth.uid()),'activity saved in same transaction');
select pg_temp.denied($q$select public.save_partner_profile('must roll back','{"regions":["invalid"],"times":{},"transports":[],"mobility":[],"hospitals":[]}')$q$,'invalid activity rejected');
select pg_temp.assert((select intro='new intro' from public.partner_accounts where profile_id=auth.uid()),'invalid save preserves prior intro');
select pg_temp.denied($q$select public.save_partner_profile(repeat('a',301),null)$q$,'intro length checked in DB');
select public.withdraw_partner_evidence('00000278-0000-4000-8000-000000000010','QUALIFICATION');
select pg_temp.assert(not exists(select 1 from public.partner_qualifications where id='00000278-0000-4000-8000-000000000010'),'unreviewed qualification removed');
select pg_temp.denied($q$select public.withdraw_partner_evidence('00000278-0000-4000-8000-000000000011','QUALIFICATION')$q$,'reviewed qualification protected');
select pg_temp.denied($q$delete from public.partner_qualifications where id='00000278-0000-4000-8000-000000000011'$q$,'direct delete cannot bypass reviewed protection');
select pg_temp.denied($q$select public.withdraw_partner_evidence('00000278-0000-4000-8000-000000000012','QUALIFICATION')$q$,'pending appeal evidence protected');
select public.delete_partner_work_history('00000278-0000-4000-8000-000000000013');
select pg_temp.denied($q$select public.delete_partner_work_history('00000278-0000-4000-8000-000000000014')$q$,'legacy history delete respects retention');
reset role;
select pg_temp.assert(exists(select 1 from public.partner_evidence_deletions where path='278/unreviewed.pdf'),'Storage deletion queued only after allowed withdrawal');
select pg_temp.assert((select count(*)=2 from public.partner_evidence_deletions where path in ('278/extra-a.pdf','278/extra-b.pdf')),'all registered attachments queued for deletion');
select pg_temp.assert(not exists(select 1 from public.partner_evidence_deletions where path in ('278/reviewed.pdf','278/appeal.pdf')),'blocked withdrawal leaves originals intact');
rollback;

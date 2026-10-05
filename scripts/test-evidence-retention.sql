begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label;
end $$;
create function pg_temp.denied(sql text) returns void language plpgsql as $$ begin
  begin execute sql; exception when others then return; end; raise exception 'FAIL expected denied: %',sql;
end $$;
insert into auth.users(id,email) values
('00000199-0085-4000-8000-000000000001','retention-partner@example.invalid'),
('00000199-0085-4000-8000-000000000002','retention-admin@example.invalid'),
('00000199-0085-4000-8000-000000000003','retention-other@example.invalid');
insert into public.profiles(id,name,role) values
('00000199-0085-4000-8000-000000000001','Retention Partner','PARTNER'),
('00000199-0085-4000-8000-000000000002','Retention Admin','ADMIN'),
('00000199-0085-4000-8000-000000000003','Other','USER');
insert into public.partner_accounts(profile_id,login_id) values('00000199-0085-4000-8000-000000000001','retention-85');
insert into public.admin_accounts(profile_id,duty) values('00000199-0085-4000-8000-000000000002','심사');
insert into public.partner_qualifications(id,partner_id,type,path,filename,size) values
('00000199-0085-4000-8000-000000000010','00000199-0085-4000-8000-000000000001','License','00000199-0085-4000-8000-000000000001/evidence/q.pdf','q.pdf',10),
('00000199-0085-4000-8000-000000000011','00000199-0085-4000-8000-000000000001','Legacy','00000199-0085-4000-8000-000000000001/legacy.pdf','legacy.pdf',10);
insert into public.partner_work_histories(id,partner_id,hospital,period,department,duties) values
('00000199-0085-4000-8000-000000000012','00000199-0085-4000-8000-000000000001','Hospital','2020~2025','Department','Work');
insert into public.partner_evidence_files(partner_id,qualification_id,history_id,path,filename,size) values
('00000199-0085-4000-8000-000000000001','00000199-0085-4000-8000-000000000010',null,'00000199-0085-4000-8000-000000000001/evidence/q.pdf','q.pdf',10),
('00000199-0085-4000-8000-000000000001',null,'00000199-0085-4000-8000-000000000012','00000199-0085-4000-8000-000000000001/evidence/w1.pdf','w1.pdf',10),
('00000199-0085-4000-8000-000000000001',null,'00000199-0085-4000-8000-000000000012','00000199-0085-4000-8000-000000000001/evidence/w2.pdf','w2.pdf',10);
insert into storage.objects(bucket_id,name) select 'partner-qualifications',path from public.partner_evidence_files
where partner_id='00000199-0085-4000-8000-000000000001';
select pg_temp.assert(not has_table_privilege('authenticated','public.partner_evidence_retention','UPDATE'),'client cannot extend or directly hold');
select pg_temp.assert(not has_function_privilege('authenticated','public.start_partner_evidence_retention(uuid,text)','EXECUTE'),'client cannot set notification date');
select set_config('request.jwt.claims','{"sub":"00000199-0085-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select pg_temp.denied($q$select public.admin_review_qualification('00000199-0085-4000-8000-000000000010','PENDING','VERIFIED','test qualification review')$q$);
select pg_temp.assert(not exists(select 1 from public.partner_evidence_retention),'failed review never starts clock');
select set_config('request.jwt.claims','{"sub":"00000199-0085-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select public.admin_review_qualification('00000199-0085-4000-8000-000000000010','PENDING','VERIFIED','test qualification review');
select public.admin_review_work_history('00000199-0085-4000-8000-000000000012','PENDING','VERIFIED','test work history review');
select pg_temp.assert(count(*)=2 and bool_and(expires_at=notified_at+interval '30 days'),'successful review starts exact 30 days') from public.partner_evidence_retention;
select pg_temp.assert(count(*)=2,'review notifications include 30 day notice') from public.notifications
where recipient_id='00000199-0085-4000-8000-000000000001' and body like '%30일%';
update public.partner_evidence_retention set notified_at=now()-interval '2 days',expires_at=now()+interval '28 days' where item_id='00000199-0085-4000-8000-000000000010';
select public.admin_review_qualification('00000199-0085-4000-8000-000000000010','VERIFIED','PENDING','test repeated review');
select public.admin_review_qualification('00000199-0085-4000-8000-000000000010','PENDING','VERIFIED','test final review');
select pg_temp.assert(notified_at=now()-interval '2 days','re-review never restarts clock') from public.partner_evidence_retention where item_id='00000199-0085-4000-8000-000000000010';
select set_config('request.jwt.claims','{"sub":"00000199-0085-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select pg_temp.denied($q$select public.partner_evidence_retention_status('00000199-0085-4000-8000-000000000010','QUALIFICATION')$q$);
select pg_temp.denied($q$select public.manage_partner_evidence_retention('00000199-0085-4000-8000-000000000010','QUALIFICATION','appeal','test foreign appeal')$q$);
select set_config('request.jwt.claims','{"sub":"00000199-0085-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select pg_temp.denied($q$select public.manage_partner_evidence_retention('00000199-0085-4000-8000-000000000010','QUALIFICATION','resolve','test self resolve')$q$);
select public.manage_partner_evidence_retention('00000199-0085-4000-8000-000000000012','HISTORY','appeal','test work appeal');
update public.partner_evidence_retention set notified_at=now()-interval '30 days'+interval '1 second',expires_at=now()+interval '1 second' where item_id='00000199-0085-4000-8000-000000000010';
select pg_temp.assert(public.partner_evidence_path_readable('00000199-0085-4000-8000-000000000001/evidence/q.pdf'),'one second before expiry readable');
select set_config('request.jwt.claims','{"sub":"00000199-0085-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select pg_temp.assert(not public.partner_evidence_path_readable('00000199-0085-4000-8000-000000000001/evidence/q.pdf'),'foreign partner RPC learns nothing about another path');
select set_config('request.jwt.claims','{"sub":"00000199-0085-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select * from public.list_partner_evidence_deletions();
select pg_temp.assert(count(*)=3,'no original purged before deadline') from public.partner_evidence_files;
update public.partner_evidence_retention set notified_at=now()-interval '30 days',expires_at=now();
select pg_temp.assert(not public.partner_evidence_path_readable('00000199-0085-4000-8000-000000000001/evidence/q.pdf'),'exact expiry blocks reads before cron');
select pg_temp.denied($q$select public.manage_partner_evidence_retention('00000199-0085-4000-8000-000000000010','QUALIFICATION','appeal','test late appeal')$q$);
set local role authenticated;
select pg_temp.assert(not exists(select 1 from storage.objects where name='00000199-0085-4000-8000-000000000001/evidence/q.pdf'),'owner REST storage cannot bypass expiry');
reset role;
select * from public.list_partner_evidence_deletions();
select pg_temp.assert(path is null and filename is null and size is null and status='VERIFIED','qualification verification survives original expiry') from public.partner_qualifications where id='00000199-0085-4000-8000-000000000010';
select pg_temp.assert(count(*)=2,'ongoing appeal preserves both work originals') from public.partner_evidence_files;
select pg_temp.assert(count(*)=1,'expired original queued once') from public.partner_evidence_deletions;
select * from public.list_partner_evidence_deletions();
select pg_temp.assert(count(*)=1,'retry does not duplicate deletion') from public.partner_evidence_deletions;
select set_config('request.jwt.claims','{"sub":"00000199-0085-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select pg_temp.denied($q$select public.manage_partner_evidence_retention('00000199-0085-4000-8000-000000000012','HISTORY','resolve','test resolution')$q$);
select set_config('request.jwt.claims','{"sub":"00000199-0085-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select public.manage_partner_evidence_retention('00000199-0085-4000-8000-000000000012','HISTORY','resolve','test appeal resolved');
select * from public.list_partner_evidence_deletions();
select pg_temp.assert(count(*)=3,'overdue resolved appeal queues both originals') from public.partner_evidence_deletions;
select pg_temp.assert(status='VERIFIED','work verification survives original purge') from public.partner_work_histories where id='00000199-0085-4000-8000-000000000012';
select public.manage_partner_evidence_retention('00000199-0085-4000-8000-000000000011','QUALIFICATION','notify','test legacy final result');
select pg_temp.assert(notified_at=now(),'unknown legacy date comes from actual new notice') from public.partner_evidence_retention where item_id='00000199-0085-4000-8000-000000000011';
select pg_temp.denied($q$select public.manage_partner_evidence_retention('00000199-0085-4000-8000-000000000011','QUALIFICATION','notify','test extend legacy')$q$);
rollback;

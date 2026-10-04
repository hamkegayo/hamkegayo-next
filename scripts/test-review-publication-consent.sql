begin;
create function pg_temp.assert(p_ok boolean,p_label text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'FAIL: %',p_label; end if; raise notice 'PASS: %',p_label; end $$;
create function pg_temp.denied(p_sql text,p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when insufficient_privilege then raise notice 'PASS: %',p_label; return; end;
  raise exception 'FAIL: %',p_label;
end $$;
insert into auth.users(id,email,raw_app_meta_data) values('00000171-0000-4000-8000-000000000001','review-admin@example.invalid','{}');
insert into public.profiles(id,name,role) values('00000171-0000-4000-8000-000000000001','Consent Test Admin','ADMIN');
insert into public.admin_accounts(profile_id,duty) values('00000171-0000-4000-8000-000000000001','전체');

select pg_temp.assert(not exists(select 1 from public.get_public_reviews() where source='provided'),'legacy timestamp is not actual recipient consent');
set local role anon;
select pg_temp.denied('select * from public.reviews','anonymous raw review denied');
select pg_temp.denied('select * from public.review_publication_consents','consent subjects and evidence private');
select pg_temp.denied('select * from public.review_publications','public snapshot direct query denied');
reset role;
select set_config('request.jwt.claims','{"sub":"00000171-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_withdraw_review_publication('00000000-0000-4000-8000-000000000001','Withdrawal request')$q$,'MFA required');
select pg_temp.denied('update public.review_publication_release set health_enabled=true','client cannot enable health disclosure');
reset role;
select set_config('request.jwt.claims','{"sub":"00000171-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_publish_review('provided','00000175-0000-4000-8000-000000000001','recipient-ref-test','ACTUAL_RECIPIENT','evidence-ref-test',null,now(),'review-publication-2026-10-04-v1',repeat('test wording ',20),'["후기 공개본","내시경"]','Approved title','Approved content',true)$q$,'health disclosure blocked before procedure ready');
do $$ begin
  begin
    perform public.admin_publish_review('provided','00000175-0000-4000-8000-000000000001','recipient-ref-test','VERIFIED_REPRESENTATIVE','evidence-ref-test',null,now(),'review-publication-2026-10-04-v1',repeat('test wording ',20),'["후기 공개본"]','Approved title','Approved content',false);
    raise exception 'FAIL: representative without authority accepted';
  exception when check_violation then raise notice 'PASS: authority evidence mandatory'; end;
end $$;
select public.admin_publish_review('provided','00000175-0000-4000-8000-000000000001','recipient-ref-test','ACTUAL_RECIPIENT','evidence-ref-test',null,now(),'review-publication-2026-10-04-v1',repeat('test wording ',20),'["후기 공개본"]','Approved title','Approved content',false);
reset role;
select pg_temp.assert((select expires_at=consented_at+interval '3 years' from public.review_publication_consents where review_id='00000175-0000-4000-8000-000000000001'),'three years from consent');
set local role anon;
select pg_temp.assert((select count(*) from public.get_public_reviews() where title='Approved title' and content='Approved content')=1,'only approved snapshot public');
select pg_temp.assert(not exists(select 1 from public.get_public_reviews() r where to_jsonb(r) ?| array['subject_reference','evidence_reference','allowed_items','consent_id']),'public RPC excludes private consent metadata');
reset role;
-- 검증된 공개본도 플래그·만료·철회 조건을 조회할 때마다 확인한다.
update public.review_publication_release set health_enabled=true;
set local role authenticated;
select public.admin_publish_review('provided','00000175-0000-4000-8000-000000000001','recipient-ref-test','ACTUAL_RECIPIENT','evidence-ref-test',null,now(),'review-publication-2026-10-04-v1',repeat('test wording ',20),'["후기 공개본","내시경"]','Approved title','Approved content',true);
reset role;
update public.review_publication_release set health_enabled=false;
select pg_temp.assert(not exists(select 1 from public.get_public_reviews()),'health gate also applies to previously approved snapshot');
update public.review_publication_release set health_enabled=true;
select pg_temp.assert((select count(*) from public.get_public_reviews())=1,'ready gate allows verified publication');
update public.review_publication_consents set consented_at=now()-interval '4 years',expires_at=(now()-interval '4 years')+interval '3 years';
select pg_temp.assert(not exists(select 1 from public.get_public_reviews()),'expired consent hides publication without scheduler');
update public.review_publication_consents set consented_at=now(),expires_at=now()+interval '3 years';
select set_config('test.consent_id',(select consent_id::text from public.review_publications limit 1),true);
set local role authenticated;
select public.admin_withdraw_review_publication(current_setting('test.consent_id')::uuid,'Actual recipient withdrawal');
reset role;
select pg_temp.assert(not exists(select 1 from public.get_public_reviews()),'withdrawal immediately removes public snapshot');
rollback;

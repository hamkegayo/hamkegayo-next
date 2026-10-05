begin;
create function pg_temp.denied(sql text) returns void language plpgsql as $$ begin begin execute sql;exception when insufficient_privilege then return;end;raise exception 'expected denied';end;$$;
insert into auth.users(id,email) values('00000080-0000-4000-8000-000000000081','publication-admin@example.invalid');
insert into public.profiles(id,name,role) values('00000080-0000-4000-8000-000000000081','Publication Admin','ADMIN');
insert into public.admin_accounts(profile_id,duty) values('00000080-0000-4000-8000-000000000081','전체');
select set_config('request.jwt.claims','{"sub":"00000080-0000-4000-8000-000000000081","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.denied($q$select public.admin_review_publication_queue('후기 공개 동의 확인')$q$);
reset role;
select set_config('request.jwt.claims','{"sub":"00000080-0000-4000-8000-000000000081","role":"authenticated","aal":"aal2"}',true);
update public.admin_accounts set duty='정산' where profile_id='00000080-0000-4000-8000-000000000081';
set local role authenticated;
select pg_temp.denied($q$select public.admin_review_publication_queue('후기 공개 동의 확인')$q$);
reset role;
update public.admin_accounts set duty='전체' where profile_id='00000080-0000-4000-8000-000000000081';
set local role authenticated;
do $$ begin
 if jsonb_array_length(public.admin_review_publication_queue('후기 공개 동의 확인')->'reviews')<>12 then raise exception 'admin queue incomplete';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.get_public_reviews() where source='provided')<>12 then raise exception 'confirmed twelve reviews not public'; end if;
 if exists(select 1 from public.review_publication_consents where source='provided' and verification_method='PROJECT_OWNER_CONFIRMATION'
  and (consenting_party<>'ACTUAL_RECIPIENT' or consented_at<>'2026-10-04T00:00:00+09:00' or expires_at<>'2029-10-04T00:00:00+09:00' or consent_time_precision<>'DATE' or verified_by is not null)) then raise exception 'confirmation metadata mismatch'; end if;
 if (select health_enabled from public.review_publication_release where id) then raise exception 'health gate changed'; end if;
 if exists(select 1 from public.get_public_reviews() where source='provided' and (title||content) ~ '(항암|내시경|수면검사)') then raise exception 'specific medical text restored'; end if;
end $$;
set local role anon;
select pg_temp.denied($q$select public.admin_review_publication_queue('후기 공개 동의 확인')$q$);
do $$ begin
 if (select count(*) from public.get_public_reviews(6))<>6 then raise exception 'home reviews missing'; end if;
 if exists(select 1 from public.get_public_reviews() r where to_jsonb(r) ?| array['evidence_reference','verifier_reference','verification_method','consent_id','subject_reference']) then raise exception 'private approval metadata exposed'; end if;
 begin perform * from public.review_publication_consents;raise exception 'consent directly readable';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.review_publication_consents set withdrawn_at=now(),withdrawal_reason='실제 이용자 철회 확인' where review_id='00000175-0000-4000-8000-000000000012';
do $$ begin if (select count(*) from public.get_public_reviews() where source='provided')<>11 then raise exception 'withdrawal not hidden'; end if;end $$;
-- 확인 출처는 보존하면서 동의 만료 후 노출은 즉시 중단한다.
update public.review_publication_consents set consented_at=now()-interval '4 years',expires_at=(now()-interval '4 years')+interval '3 years' where source='provided';
do $$ begin if exists(select 1 from public.get_public_reviews() where source='provided') then raise exception 'expired publication visible'; end if;end $$;
rollback;

-- #199: 기존 자격·경력과 심사 상태 보존, 추가 증빙 비공개 접근.
-- 새 증빙 수집 고지 확인 전에는 enabled=false 유지.
create table public.partner_evidence_release(id boolean primary key default true check(id),enabled boolean not null default false);
insert into public.partner_evidence_release(id) values(true);
alter table public.partner_evidence_release enable row level security;
revoke all on public.partner_evidence_release from anon,authenticated;
create function public.partner_evidence_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from public.partner_evidence_release where id),false);
$$;
revoke all on function public.partner_evidence_enabled() from public,anon;
grant execute on function public.partner_evidence_enabled() to authenticated;
alter table public.partner_work_histories add column kind text not null default 'MEDICAL' check(kind in ('MEDICAL','COMPANION')),
 add column started_on date, add column ended_on date, add column current_job boolean not null default false;
alter table public.partner_work_histories add constraint work_history_dates check(ended_on is null or started_on is null or ended_on>=started_on);
create table public.partner_evidence_files (
 id uuid primary key default gen_random_uuid(),
 partner_id uuid not null references public.partner_accounts(profile_id) on delete cascade,
 qualification_id uuid references public.partner_qualifications(id) on delete cascade,
 history_id uuid references public.partner_work_histories(id) on delete cascade,
 path text not null unique, filename text not null,
 size integer not null check(size between 1 and 5242880),
 check(num_nonnulls(qualification_id,history_id)=1)
);
alter table public.partner_evidence_files enable row level security;
revoke all on public.partner_evidence_files from anon,authenticated;
grant select on public.partner_evidence_files to authenticated;
create policy evidence_own on public.partner_evidence_files for select to authenticated using(partner_id=auth.uid());
create table public.partner_evidence_deletions(path text primary key,created_at timestamptz not null default now());
alter table public.partner_evidence_deletions enable row level security;
revoke all on public.partner_evidence_deletions from anon,authenticated;
create function public.queue_partner_evidence_deletion() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.partner_evidence_deletions(path) values(old.path) on conflict do nothing; return old;
end; $$;
revoke all on function public.queue_partner_evidence_deletion() from public,anon,authenticated;
create trigger evidence_delete after delete on public.partner_evidence_files for each row execute function public.queue_partner_evidence_deletion();

create function public.submit_partner_evidence(p_partner uuid,p_kind text,p_input jsonb,p_files jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_owner uuid:=p_partner; f jsonb; v_start date; v_end date;
begin
 if not public.partner_evidence_enabled() then raise exception 'evidence_notice_pending' using errcode='42501'; end if;
 if not exists(select 1 from public.partner_accounts a join public.profiles p on p.id=a.profile_id where a.profile_id=v_owner and p.status='ACTIVE' and p.role='PARTNER') then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.partner_accounts where profile_id=v_owner for update;
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 5 then raise exception 'files_required'; end if;
 for f in select value from jsonb_array_elements(p_files) loop
  if f->>'path' not like v_owner::text||'/%' or not exists(select 1 from storage.objects o where o.bucket_id='partner-qualifications' and o.name=f->>'path') then raise exception 'invalid_file'; end if;
 end loop;
 if p_kind='QUALIFICATION' then
  if char_length(trim(p_input->>'type')) not between 1 and 100 or char_length(coalesce(p_input->>'regNo',''))>100 or char_length(coalesce(p_input->>'issuer',''))>100 then raise exception 'invalid_input'; end if;
  if (select count(*) from public.partner_qualifications where partner_id=v_owner)>=30 then raise exception 'qualification_limit'; end if;
  insert into public.partner_qualifications(partner_id,type,reg_no,acquired_date,issuer,path,filename,size)
   values(v_owner,trim(p_input->>'type'),nullif(p_input->>'regNo',''),nullif(p_input->>'date','')::date,nullif(p_input->>'issuer',''),p_files->0->>'path',p_files->0->>'filename',(p_files->0->>'size')::integer) returning id into v_id;
 elsif p_kind in ('MEDICAL','COMPANION') then
  if (select count(*) from public.partner_work_histories where partner_id=v_owner)>=20 then raise exception 'history_limit'; end if;
  v_start:=(p_input->>'startedOn')::date;
  v_end:=case when (p_input->>'currentJob')::boolean then null else (p_input->>'endedOn')::date end;
  if v_start is null or v_start>current_date or (v_end is null and not (p_input->>'currentJob')::boolean) or v_end>current_date or v_end<v_start then raise exception 'invalid_dates'; end if;
  insert into public.partner_work_histories(partner_id,hospital,period,department,duties,kind,started_on,ended_on,current_job)
   values(v_owner,trim(p_input->>'hospital'),v_start::text||' ~ '||coalesce(v_end::text,'재직 중'),trim(p_input->>'department'),trim(p_input->>'duties'),p_kind,v_start,v_end,(p_input->>'currentJob')::boolean) returning id into v_id;
 else raise exception 'invalid_kind'; end if;
 for f in select value from jsonb_array_elements(p_files) loop
  insert into public.partner_evidence_files(partner_id,qualification_id,history_id,path,filename,size)
   values(v_owner,case when p_kind='QUALIFICATION' then v_id end,case when p_kind<>'QUALIFICATION' then v_id end,f->>'path',f->>'filename',(f->>'size')::integer);
 end loop;
 return v_id;
end; $$;
revoke all on function public.submit_partner_evidence(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_partner_evidence(uuid,text,jsonb,jsonb) to service_role;

create function public.open_partner_evidence(p_id uuid,p_kind text,p_reason text default null)
returns table(path text,filename text) language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 if p_kind='QUALIFICATION' then select partner_id into v_owner from public.partner_qualifications where id=p_id;
 elsif p_kind='HISTORY' then select partner_id into v_owner from public.partner_work_histories where id=p_id;
 else raise exception 'invalid_kind'; end if;
 if v_owner is null then raise exception 'not_found'; end if;
 if v_owner=auth.uid() and not exists(select 1 from public.partner_accounts a join public.profiles p on p.id=a.profile_id where a.profile_id=v_owner and p.role='PARTNER' and p.status='ACTIVE') then raise exception 'forbidden' using errcode='42501'; end if;
 if v_owner is distinct from auth.uid() then
  if not public.can_review_qualifications() or p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'forbidden' using errcode='42501'; end if;
  perform public.log_access('PARTNER_EVIDENCE_READ',case when p_kind='QUALIFICATION' then 'partner_qualifications' else 'partner_work_histories' end,p_id,v_owner,trim(p_reason));
 end if;
 return query select f.path,f.filename from public.partner_evidence_files f where (p_kind='QUALIFICATION' and f.qualification_id=p_id) or (p_kind='HISTORY' and f.history_id=p_id);
 if p_kind='QUALIFICATION' then
  return query select q.path,q.filename from public.partner_qualifications q where q.id=p_id and not exists(select 1 from public.partner_evidence_files f where f.qualification_id=p_id and f.path=q.path);
 end if;
end; $$;
revoke all on function public.open_partner_evidence(uuid,text,text) from public,anon;
grant execute on function public.open_partner_evidence(uuid,text,text) to authenticated;
create function public.can_read_partner_evidence(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_review_qualifications() and exists(
  select 1 from public.partner_evidence_files f join public.access_logs l on l.target_id=coalesce(f.qualification_id,f.history_id)
  where f.path=p_path and l.actor_id=auth.uid() and l.action='PARTNER_EVIDENCE_READ' and l.occurred_at>now()-interval '5 minutes'
 ) or public.can_review_qualifications() and exists(
  select 1 from public.partner_qualifications q join public.access_logs l on l.target_id=q.id
  where q.path=p_path and l.actor_id=auth.uid() and l.action='PARTNER_EVIDENCE_READ' and l.occurred_at>now()-interval '5 minutes'
 );
$$;
revoke all on function public.can_read_partner_evidence(text) from public,anon;
grant execute on function public.can_read_partner_evidence(text) to authenticated;
create policy partner_evidence_review on storage.objects for select to authenticated using(bucket_id='partner-qualifications' and public.can_read_partner_evidence(name));

drop policy partner_qual_insert_own on storage.objects;
create policy partner_qual_insert_own on storage.objects for insert to authenticated with check(
 bucket_id='partner-qualifications' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.partner_accounts a join public.profiles p on p.id=a.profile_id where a.profile_id=auth.uid() and p.role='PARTNER' and p.status='ACTIVE')
 and ((storage.foldername(name))[2] is distinct from 'evidence' or public.partner_evidence_enabled())
);

create function public.list_partner_evidence_deletions() returns table(path text) language plpgsql security definer set search_path='' as $$
begin
 insert into public.partner_evidence_deletions(path)
 select o.name from storage.objects o where o.bucket_id='partner-qualifications' and split_part(o.name,'/',2)='evidence'
 and o.created_at<now()-interval '1 day' and not exists(select 1 from public.partner_evidence_files f where f.path=o.name)
 on conflict do nothing;
 return query select d.path from public.partner_evidence_deletions d order by d.created_at limit 100;
end; $$;
revoke all on function public.list_partner_evidence_deletions() from public,anon,authenticated;
grant execute on function public.list_partner_evidence_deletions() to service_role;

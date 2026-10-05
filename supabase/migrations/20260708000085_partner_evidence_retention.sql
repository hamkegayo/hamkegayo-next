-- #199 사용자 결정(2026-10-05): 심사 결과 통지 후 30일 이의신청 기간.
-- 처리방침 제4조/제11조: 목적 달성 후 증빙 원본 파기. 진행 중 이의신청은 종료까지 보류.
-- 검증된 자격/경력 정보와 인증 상태는 원본 파기와 분리한다. 새 수집 플래그는 변경하지 않는다.
create table public.partner_evidence_retention (
  kind text not null check(kind in ('QUALIFICATION','HISTORY')),
  item_id uuid not null,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  notified_at timestamptz not null,
  expires_at timestamptz not null,
  appeal_open boolean not null default false,
  appeal_reason text,
  purge_queued_at timestamptz,
  primary key(kind,item_id),
  check(expires_at=notified_at+interval '30 days')
);
alter table public.partner_evidence_retention enable row level security;
revoke all on public.partner_evidence_retention from public,anon,authenticated;
grant all on public.partner_evidence_retention to service_role;

-- 심사 RPC가 알림까지 성공한 뒤에만 시각을 기록한다. 재심사로 기한을 연장하지 않는다.
create function public.start_partner_evidence_retention(p_id uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  if p_kind='QUALIFICATION' then select partner_id into v_owner from public.partner_qualifications where id=p_id;
  else select partner_id into v_owner from public.partner_work_histories where id=p_id; end if;
  insert into public.partner_evidence_retention(kind,item_id,partner_id,notified_at,expires_at)
  values(p_kind,p_id,v_owner,now(),now()+interval '30 days') on conflict do nothing;
end $$;
revoke all on function public.start_partner_evidence_retention(uuid,text) from public,anon,authenticated;
alter function public.admin_review_qualification(uuid,public.qualification_status,public.qualification_status,text) rename to admin_review_qualification_before_retention;
revoke all on function public.admin_review_qualification_before_retention(uuid,public.qualification_status,public.qualification_status,text) from public,anon,authenticated;
create function public.admin_review_qualification(p_id uuid,p_expected public.qualification_status,p_status public.qualification_status,p_reason text)
returns void language plpgsql security definer set search_path='' as $$ begin
  perform public.admin_review_qualification_before_retention(p_id,p_expected,p_status,p_reason);
  perform public.start_partner_evidence_retention(p_id,'QUALIFICATION');
end $$;
revoke all on function public.admin_review_qualification(uuid,public.qualification_status,public.qualification_status,text) from public,anon;
grant execute on function public.admin_review_qualification(uuid,public.qualification_status,public.qualification_status,text) to authenticated;
alter function public.admin_review_work_history(uuid,public.qualification_status,public.qualification_status,text) rename to admin_review_work_history_before_retention;
revoke all on function public.admin_review_work_history_before_retention(uuid,public.qualification_status,public.qualification_status,text) from public,anon,authenticated;
create function public.admin_review_work_history(p_id uuid,p_expected public.qualification_status,p_status public.qualification_status,p_reason text)
returns void language plpgsql security definer set search_path='' as $$ begin
  perform public.admin_review_work_history_before_retention(p_id,p_expected,p_status,p_reason);
  perform public.start_partner_evidence_retention(p_id,'HISTORY');
end $$;
revoke all on function public.admin_review_work_history(uuid,public.qualification_status,public.qualification_status,text) from public,anon;
grant execute on function public.admin_review_work_history(uuid,public.qualification_status,public.qualification_status,text) to authenticated;

create function public.append_evidence_retention_notice() returns trigger
language plpgsql set search_path='' as $$ begin
  if new.type in ('QUALIFICATION_VERIFIED','QUALIFICATION_REVIEW_REQUIRED','WORK_HISTORY_REVIEW') then
    new.body:=coalesce(new.body,'')||' 증빙 원본은 최초 심사 결과 통지 후 30일간 보관합니다. My 프로필에서 기간과 이의신청 방법을 확인해 주세요.';
  end if;
  return new;
end $$;
revoke all on function public.append_evidence_retention_notice() from public,anon,authenticated;
create trigger evidence_retention_notice before insert on public.notifications
for each row execute function public.append_evidence_retention_notice();

-- 기존 자료는 실제 심사 감사 시각이 있는 경우에만 이력을 연결한다. 없는 시각을 만들어 넣지 않는다.
insert into public.partner_evidence_retention(kind,item_id,partner_id,notified_at,expires_at)
select 'QUALIFICATION',q.id,q.partner_id,max(l.occurred_at),max(l.occurred_at)+interval '30 days'
from public.partner_qualifications q join public.access_logs l on l.target_id=q.id
where l.action='QUALIFICATION_REVIEW' and l.target_table='partner_qualifications'
group by q.id,q.partner_id;
insert into public.partner_evidence_retention(kind,item_id,partner_id,notified_at,expires_at)
select 'HISTORY',h.id,h.partner_id,max(l.occurred_at),max(l.occurred_at)+interval '30 days'
from public.partner_work_histories h join public.access_logs l on l.target_id=h.id
where l.action='WORK_HISTORY_REVIEW' and l.target_table='partner_work_histories'
group by h.id,h.partner_id;

create function public.cleanup_partner_evidence_retention() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.partner_evidence_retention where item_id=old.id
    and kind=case when tg_table_name='partner_qualifications' then 'QUALIFICATION' else 'HISTORY' end;
  if tg_table_name='partner_qualifications' and old.path is not null then
    insert into public.partner_evidence_deletions(path) values(old.path) on conflict do nothing;
  end if;
  return old;
end $$;
revoke all on function public.cleanup_partner_evidence_retention() from public,anon,authenticated;
create trigger qualification_retention_cleanup after delete on public.partner_qualifications
for each row execute function public.cleanup_partner_evidence_retention();
create trigger history_retention_cleanup after delete on public.partner_work_histories
for each row execute function public.cleanup_partner_evidence_retention();
alter table public.partner_qualifications alter column path drop not null,
  alter column filename drop not null, alter column size drop not null;

create function public.partner_evidence_path_readable(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select p_path is not null
    and not exists(select 1 from public.partner_evidence_deletions d where d.path=p_path)
    and not exists(
      select 1 from public.partner_evidence_retention r
      where (r.purge_queued_at is not null or (not r.appeal_open and r.expires_at<=now()))
      and (exists(select 1 from public.partner_evidence_files f where f.path=p_path
        and ((r.kind='QUALIFICATION' and f.qualification_id=r.item_id) or (r.kind='HISTORY' and f.history_id=r.item_id)))
        or exists(select 1 from public.partner_qualifications q where r.kind='QUALIFICATION' and q.id=r.item_id and q.path=p_path))
    );
$$;
revoke all on function public.partner_evidence_path_readable(text) from public,anon;
grant execute on function public.partner_evidence_path_readable(text) to authenticated,service_role;
drop policy partner_qual_select_own on storage.objects;
create policy partner_qual_select_own on storage.objects for select to authenticated using(
  bucket_id='partner-qualifications' and (storage.foldername(name))[1]=auth.uid()::text
  and public.partner_evidence_path_readable(name)
);
drop policy partner_qual_select_admin on storage.objects;
create policy partner_qual_select_admin on storage.objects for select to authenticated using(
  bucket_id='partner-qualifications' and public.partner_evidence_path_readable(name) and public.can_read_qualification_file(name)
);
drop policy partner_evidence_review on storage.objects;
create policy partner_evidence_review on storage.objects for select to authenticated using(
  bucket_id='partner-qualifications' and public.partner_evidence_path_readable(name) and public.can_read_partner_evidence(name)
);
alter function public.open_partner_evidence(uuid,text,text) rename to open_partner_evidence_before_retention;
revoke all on function public.open_partner_evidence_before_retention(uuid,text,text) from public,anon,authenticated;
create function public.open_partner_evidence(p_id uuid,p_kind text,p_reason text default null)
returns table(path text,filename text) language sql security definer set search_path='' as $$
  select f.path,f.filename from public.open_partner_evidence_before_retention(p_id,p_kind,p_reason) f
  where public.partner_evidence_path_readable(f.path);
$$;
revoke all on function public.open_partner_evidence(uuid,text,text) from public,anon;
grant execute on function public.open_partner_evidence(uuid,text,text) to authenticated;

create function public.partner_evidence_retention_status(p_id uuid,p_kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid; r public.partner_evidence_retention;
begin
  if p_kind='QUALIFICATION' then select partner_id into v_owner from public.partner_qualifications where id=p_id;
  elsif p_kind='HISTORY' then select partner_id into v_owner from public.partner_work_histories where id=p_id;
  else raise exception 'invalid_kind'; end if;
  if v_owner is null or (v_owner is distinct from auth.uid() and not coalesce(public.can_review_qualifications(),false)) then
    raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from public.partner_evidence_retention where kind=p_kind and item_id=p_id;
  return jsonb_build_object('notifiedAt',r.notified_at,'expiresAt',r.expires_at,'appealOpen',coalesce(r.appeal_open,false),
    'unavailable',r.purge_queued_at is not null or (r.expires_at<=now() and not r.appeal_open));
end $$;
revoke all on function public.partner_evidence_retention_status(uuid,text) from public,anon;
grant execute on function public.partner_evidence_retention_status(uuid,text) to authenticated;

-- 본인 이의신청, 담당자 접수/종료, 통지일 미확인 기존 자료의 재통지.
-- 자료 행 -> 보유 행 순서로 잠그며 파기와 신청/종료 경쟁을 직렬화한다.
create function public.manage_partner_evidence_retention(p_id uuid,p_kind text,p_action text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid; r public.partner_evidence_retention; v_admin boolean:=coalesce(public.can_review_qualifications(),false);
begin
  if p_action is null or p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'reason_required'; end if;
  if p_kind='QUALIFICATION' then select partner_id into v_owner from public.partner_qualifications where id=p_id for update;
  elsif p_kind='HISTORY' then select partner_id into v_owner from public.partner_work_histories where id=p_id for update;
  else raise exception 'invalid_kind'; end if;
  if v_owner is null then raise exception 'not_found'; end if;
  if p_action='appeal' then
    if v_owner is distinct from auth.uid() or not exists(select 1 from public.profiles where id=auth.uid() and role='PARTNER' and status='ACTIVE') then
      raise exception 'forbidden' using errcode='42501'; end if;
  elsif p_action not in ('hold','resolve','notify') or not v_admin then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from public.partner_evidence_retention where kind=p_kind and item_id=p_id for update;
  if p_action='notify' then
    if found then raise exception 'already_notified'; end if;
    insert into public.partner_evidence_retention(kind,item_id,partner_id,notified_at,expires_at)
    values(p_kind,p_id,v_owner,now(),now()+interval '30 days');
  else
    if not found or r.purge_queued_at is not null then raise exception 'evidence_unavailable'; end if;
    if p_action in ('appeal','hold') then
      if r.expires_at<=now() and not r.appeal_open then raise exception 'appeal_period_expired'; end if;
      if r.appeal_open then raise exception 'appeal_already_open'; end if;
      update public.partner_evidence_retention set appeal_open=true,appeal_reason=trim(p_reason) where kind=p_kind and item_id=p_id;
    elsif p_action='resolve' then
      if not r.appeal_open then raise exception 'no_open_appeal'; end if;
      update public.partner_evidence_retention set appeal_open=false,appeal_reason=null where kind=p_kind and item_id=p_id;
    end if;
  end if;
  perform public.log_access('EVIDENCE_RETENTION',case when p_kind='QUALIFICATION' then 'partner_qualifications' else 'partner_work_histories' end,p_id,v_owner,p_action||': '||trim(p_reason));
  insert into public.notifications(recipient_id,type,title,body,link)
  values(v_owner,'EVIDENCE_RETENTION','증빙 보유 및 이의신청 안내',
    case p_action when 'notify' then '심사 결과: '||trim(p_reason)||'. 증빙 원본은 이 통지부터 30일 후 파기 대상입니다. 기간 내 My 프로필에서 이의신청할 수 있습니다.'
    when 'resolve' then '이의신청 처리 완료: '||trim(p_reason)||'. 기존 30일 기간이 지났으면 증빙 원본을 파기합니다.'
    else '이의신청 접수: '||trim(p_reason)||'. 처리 종료까지 증빙 원본 파기를 보류합니다.' end,'/partner/profile');
end $$;
revoke all on function public.manage_partner_evidence_retention(uuid,text,text,text) from public,anon;
grant execute on function public.manage_partner_evidence_retention(uuid,text,text,text) to authenticated;

create or replace function public.list_partner_evidence_deletions() returns table(path text)
language plpgsql security definer set search_path='' as $$
declare candidate record; r public.partner_evidence_retention; v_path text;
begin
  for candidate in select kind,item_id from public.partner_evidence_retention
    where expires_at<=now() and not appeal_open and purge_queued_at is null limit 100 loop
    if candidate.kind='QUALIFICATION' then
      select q.path into v_path from public.partner_qualifications q where q.id=candidate.item_id for update;
    else
      perform 1 from public.partner_work_histories where id=candidate.item_id for update;
      v_path:=null;
    end if;
    select * into r from public.partner_evidence_retention where kind=candidate.kind and item_id=candidate.item_id for update;
    if not found or r.appeal_open or r.purge_queued_at is not null or r.expires_at>now() then continue; end if;
    if v_path is not null then insert into public.partner_evidence_deletions(path) values(v_path) on conflict do nothing; end if;
    -- evidence_delete queues every attached file atomically before removing private metadata.
    delete from public.partner_evidence_files where
      (candidate.kind='QUALIFICATION' and qualification_id=candidate.item_id) or (candidate.kind='HISTORY' and history_id=candidate.item_id);
    if candidate.kind='QUALIFICATION' then
      update public.partner_qualifications set path=null,filename=null,size=null where id=candidate.item_id;
    end if;
    update public.partner_evidence_retention set purge_queued_at=now(),appeal_reason=null
      where kind=candidate.kind and item_id=candidate.item_id;
  end loop;
  insert into public.partner_evidence_deletions(path)
  select o.name from storage.objects o where o.bucket_id='partner-qualifications' and split_part(o.name,'/',2)='evidence'
    and o.created_at<now()-interval '1 day' and not exists(select 1 from public.partner_evidence_files f where f.path=o.name)
  on conflict do nothing;
  return query select d.path from public.partner_evidence_deletions d order by d.created_at limit 100;
end $$;
revoke all on function public.list_partner_evidence_deletions() from public,anon,authenticated;
grant execute on function public.list_partner_evidence_deletions() to service_role;

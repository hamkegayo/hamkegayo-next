-- #56 자격 심사: 처리방침 제13조 접근권한 관리·인증정보 보호·접근통제.
-- 기존 관리자 부트스트랩의 duty='전체'와 심사 담당 duty='심사'만 허용한다.
create or replace function public.can_review_qualifications()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin_live() and exists (
    select 1 from public.admin_accounts
    where profile_id = auth.uid() and duty in ('전체', '심사')
  );
$$;
revoke all on function public.can_review_qualifications() from public, anon;
grant execute on function public.can_review_qualifications() to authenticated;

-- 직접 목록 조회에도 담당 업무를 적용한다. 파트너 본인 정책은 유지.
drop policy if exists partner_quals_select_admin on public.partner_qualifications;
create policy partner_quals_select_admin on public.partner_qualifications
for select to authenticated using (public.can_review_qualifications());

create or replace function public.admin_review_qualification(
  p_id uuid, p_expected public.qualification_status,
  p_status public.qualification_status, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_partner uuid;
  v_type text;
begin
  if not public.can_review_qualifications() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 500
     or p_status is null or p_expected is null or p_status = p_expected then
    raise exception 'invalid_review' using errcode = '22023';
  end if;
  update public.partner_qualifications set status = p_status
  where id = p_id and status = p_expected
  returning partner_id, type into v_partner, v_type;
  if v_partner is null then
    raise exception 'qualification_changed' using errcode = 'P0002';
  end if;
  perform public.log_access('QUALIFICATION_REVIEW', 'partner_qualifications',
    p_id, v_partner, p_expected::text || ' → ' || p_status::text || ': ' || trim(p_reason));

  insert into public.notifications (recipient_id, type, title, body, link)
  values (
    v_partner,
    case when p_status = 'VERIFIED' then 'QUALIFICATION_VERIFIED'
         else 'QUALIFICATION_REVIEW_REQUIRED' end,
    case when p_status = 'VERIFIED' then '자격 인증이 완료되었습니다.'
         else '자격 증빙을 다시 확인해 주세요.' end,
    v_type || ': ' || trim(p_reason),
    '/partner/profile'
  );
end;
$$;
revoke all on function public.admin_review_qualification(uuid, public.qualification_status, public.qualification_status, text) from public, anon;
grant execute on function public.admin_review_qualification(uuid, public.qualification_status, public.qualification_status, text) to authenticated;

-- 구 RPC를 통한 담당업무·사유 검사 우회를 막는다.
create or replace function public.admin_verify_qualification(
  p_id uuid, p_status public.qualification_status, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_expected public.qualification_status;
begin
  if not public.can_review_qualifications() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into v_expected from public.partner_qualifications where id = p_id;
  perform public.admin_review_qualification(p_id, v_expected, p_status, p_reason);
end;
$$;

create or replace function public.admin_get_qualification_file(p_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_row public.partner_qualifications;
begin
  if not public.can_review_qualifications() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into v_row from public.partner_qualifications where id = p_id;
  if not found then raise exception 'qualification_not_found' using errcode = 'P0002'; end if;
  perform public.log_access('QUALIFICATION_FILE_READ', 'partner_qualifications',
    p_id, v_row.partner_id, trim(p_reason));
  return v_row.path;
end;
$$;
revoke all on function public.admin_get_qualification_file(uuid, text) from public, anon;
grant execute on function public.admin_get_qualification_file(uuid, text) to authenticated;

-- 사유를 기록한 해당 파일만 5분 동안 signed URL 발급 가능.
create or replace function public.can_read_qualification_file(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_review_qualifications() and exists (
    select 1 from public.access_logs l
    join public.partner_qualifications q on q.id = l.target_id
    where l.actor_id = auth.uid() and l.action = 'QUALIFICATION_FILE_READ'
      and l.target_table = 'partner_qualifications' and q.path = p_path
      and l.occurred_at > now() - interval '5 minutes'
  );
$$;
revoke all on function public.can_read_qualification_file(text) from public, anon;
grant execute on function public.can_read_qualification_file(text) to authenticated;
drop policy if exists partner_qual_select_admin on storage.objects;
create policy partner_qual_select_admin on storage.objects for select to authenticated
using (bucket_id = 'partner-qualifications' and public.can_read_qualification_file(name));

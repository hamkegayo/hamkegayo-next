-- #56 파트너 계정 발급: 처리방침 제1조 회원가입·인증, 제13조 접근권한 관리.
-- 계정 담당 관리자만 아직 프로필이 없는 전용 Auth 사용자를 파트너 가입 대기로 등록한다.

create or replace function public.can_issue_accounts()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin_live() and exists (
    select 1 from public.admin_accounts
    where profile_id = auth.uid() and duty in ('전체', '계정')
  );
$$;
revoke all on function public.can_issue_accounts() from public, anon;
grant execute on function public.can_issue_accounts() to authenticated;

create or replace function public.admin_register_partner_account(
  p_target uuid, p_login_id text, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_login_id text := lower(trim(p_login_id));
begin
  if not public.can_issue_accounts() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_login_id !~ '^[a-z0-9][a-z0-9._-]{3,31}$'
     or p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = p_target) then
    raise exception 'target_not_dedicated' using errcode = '23514';
  end if;

  insert into public.profiles (id, role, name, status)
  values (p_target, 'PARTNER', '가입 대기', 'PENDING');
  insert into public.partner_accounts (profile_id, login_id)
  values (p_target, v_login_id);

  perform public.log_access(
    'PARTNER_ACCOUNT_ISSUE', 'profiles', p_target, p_target,
    v_login_id || ': ' || trim(p_reason)
  );
end;
$$;
revoke all on function public.admin_register_partner_account(uuid, text, text) from public, anon;
grant execute on function public.admin_register_partner_account(uuid, text, text) to authenticated;

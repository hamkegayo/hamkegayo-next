-- #56 관리자 전용 계정 발급.
-- 임시 비밀번호를 바꾸기 전에는 MFA를 우회해도 관리자 판정이 통과하지 않는다.

create or replace function public.is_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'ADMIN'
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'status', '') = 'ACTIVE'
     and coalesce((auth.jwt() -> 'app_metadata' ->> 'must_change_password')::boolean, false) = false
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_admin_live()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = auth.uid()
       and p.role = 'ADMIN'::public.user_role
       and p.status = 'ACTIVE'::public.account_status
       and coalesce((u.raw_app_meta_data ->> 'must_change_password')::boolean, false) = false
  ) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- 권한 발급 자체도 계정 담당(또는 전체) duty와 MFA를 모두 요구한다.
create or replace function public.admin_grant_role(
  p_target uuid, p_duty text default null, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role;
begin
  if not public.can_issue_accounts() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_duty not in ('전체', '계정', '심사', '정산')
     or p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select role into v_role from public.profiles where id = p_target;
  if v_role is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_role <> 'ADMIN'::public.user_role then
    if v_role <> 'USER'::public.user_role
       or exists (select 1 from public.reservations where customer_id = p_target)
       or exists (select 1 from public.partner_accounts where profile_id = p_target)
       or exists (select 1 from public.points where user_id = p_target) then
      raise exception 'target_not_dedicated' using errcode = '23514';
    end if;
  end if;

  update public.profiles set role = 'ADMIN'::public.user_role where id = p_target;
  insert into public.admin_accounts (profile_id, duty, granted_by)
  values (p_target, p_duty, auth.uid())
  on conflict (profile_id) do update
    set duty = excluded.duty, granted_by = excluded.granted_by, granted_at = now();
  insert into public.admin_role_grants (actor_id, target_id, action, reason)
  values (auth.uid(), p_target, 'GRANT', trim(p_reason));
  perform public.log_access('ADMIN_GRANT', 'profiles', p_target, p_target, trim(p_reason));
end;
$$;

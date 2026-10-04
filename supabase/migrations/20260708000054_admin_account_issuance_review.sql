-- #160 리뷰 반영: duty 권한 상승 차단과 최초 비밀번호 재발급 승인·감사.
-- 이미 스테이징에 적용된 000053은 수정하지 않고 후속 마이그레이션으로 보강한다.

create or replace function public.can_issue_admin_duty(p_duty text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin_live() and exists (
    select 1
      from public.admin_accounts
     where profile_id = auth.uid()
       and (
         (duty = '전체' and p_duty in ('계정', '심사', '정산'))
         or (duty = '계정' and p_duty in ('심사', '정산'))
       )
  );
$$;
revoke all on function public.can_issue_admin_duty(text) from public, anon;
grant execute on function public.can_issue_admin_duty(text) to authenticated;

create or replace function public.admin_grant_role(
  p_target uuid, p_duty text default null, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role;
begin
  if not public.can_issue_admin_duty(p_duty) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 500 then
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

create or replace function public.admin_authorize_password_reissue(
  p_target uuid, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target_duty text;
begin
  if p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select duty into v_target_duty
    from public.admin_accounts
   where profile_id = p_target;
  if v_target_duty is null or not public.can_issue_admin_duty(v_target_duty) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users
     where id = p_target
       and coalesce((raw_app_meta_data ->> 'must_change_password')::boolean, false)
  ) then
    raise exception 'password_already_changed' using errcode = '23514';
  end if;
  perform public.log_access(
    'ADMIN_PASSWORD_REISSUE', 'profiles', p_target, p_target, trim(p_reason)
  );
end;
$$;
revoke all on function public.admin_authorize_password_reissue(uuid, text)
  from public, anon;
grant execute on function public.admin_authorize_password_reissue(uuid, text)
  to authenticated;

-- =============================================================
-- 소셜 로그인 최초 가입 완료 (#155)
--  - OAuth 인증 완료만으로 회원 프로필을 만들지 않는다.
--  - 본인 세션의 검증된 이메일과 입력값을 확인한 뒤 프로필과 필수 동의
--    4종을 한 트랜잭션에 기록한다.
--  - provider 동의는 함께가요 약관·개인정보 동의를 대체하지 않는다.
-- =============================================================

create or replace function public.complete_social_signup(
  p_user_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_service_version text,
  p_privacy_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_email text;
begin
  select lower(coalesce(u.email, ''))
    into v_auth_email
    from auth.users u
   where u.id = p_user_id;

  if not found then
    raise exception 'AUTH_USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 이메일/비밀번호 세션이 RPC를 직접 호출해 동의 이력을 위조하지 못하게
  -- 실제 카카오·네이버 OAuth identity가 있는 계정만 허용한다.
  if not exists (
    select 1 from auth.identities i
     where i.user_id = p_user_id
       and i.provider in ('kakao', 'custom:naver')
  ) then
    raise exception 'SOCIAL_IDENTITY_REQUIRED' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'PROFILE_ALREADY_EXISTS' using errcode = '23505';
  end if;

  if trim(coalesce(p_name, '')) = '' or length(trim(p_name)) > 50 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  if p_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;

  -- 서버 액션이 받은 OAuth 사용자의 이메일과 Auth 원본을 대조한다.
  if v_auth_email = '' or lower(trim(p_email)) <> v_auth_email then
    raise exception 'EMAIL_MISMATCH' using errcode = '22023';
  end if;

  if trim(coalesce(p_service_version, '')) = ''
     or trim(coalesce(p_privacy_version, '')) = '' then
    raise exception 'AGREEMENT_VERSION_REQUIRED' using errcode = '22023';
  end if;

  insert into public.profiles (id, role, name, phone, email, status)
  values (
    p_user_id, 'USER'::public.user_role, trim(p_name), p_phone,
    v_auth_email, 'ACTIVE'::public.account_status
  );

  insert into public.user_agreements (user_id, agreement_type, version)
  values
    (p_user_id, 'SERVICE', p_service_version),
    (p_user_id, 'PRIVACY', p_privacy_version),
    (p_user_id, 'PERSONAL', p_privacy_version),
    (p_user_id, 'SENSITIVE', p_privacy_version);
end;
$$;

comment on function public.complete_social_signup(uuid, text, text, text, text, text) is
  '소셜 OAuth 최초 가입 완료(#155). 본인 이메일 검증 후 프로필과 필수 동의 이력을 원자적으로 생성한다.';

revoke all on function public.complete_social_signup(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_social_signup(uuid, text, text, text, text, text)
  to service_role;

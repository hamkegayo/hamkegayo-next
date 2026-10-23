-- =============================================================
-- 탈퇴 회원의 소셜 로그인 연결 해제 (#293)
--
--  무엇이 문제였나
--    회원탈퇴(#72)는 profiles 의 개인식별 정보를 분리 보관하고 auth 계정을
--    잠그지만, 카카오·네이버 로그인 연결(auth.identities)은 남겨 둔다.
--    같은 소셜 계정으로 다시 로그인하면 Supabase 가 (제공자, 회원번호)로
--    잠긴 탈퇴 계정을 찾아 그 계정으로 로그인시키고, 화면에는 "이용할 수 없는
--    계정입니다"만 뜬다. 소셜로 가입했다 탈퇴한 사람은 다시 가입할 수 없었다.
--
--  결정 (2026-10-23, A): 탈퇴 후 같은 소셜 계정으로 재가입을 허용한다.
--    탈퇴 시 소셜 연결을 지워, 다시 로그인하면 새 계정으로 가입되게 한다.
--    탈퇴 계정 자체는 지우지 않고 잠근 상태로 둔다(#72 분리 보관 그대로).
--    탈퇴 계정의 이메일은 이미 withdrawn+... 로 바뀌어 있어 새 계정과 겹치지 않는다.
--    이메일 로그인 연결(provider = 'email')은 건드리지 않는다.
--    제공자가 채운 auth.users.raw_user_meta_data(이름·닉네임·사진 등)도 비운다.
--
--  근거
--    개인정보처리방침 제4조 — 회원 식별 정보는 "분쟁 대응에 필요한 최소 정보만"
--      분리 보관한다. 제공자 회원번호·프로필은 그 최소 정보에 들지 않아 지운다.
--    개인정보처리방침 제11조 ① — 처리 목적이 달성된 개인정보는 지체 없이 파기한다.
--    오프닝 이벤트의 같은 이메일 1회 제한(이메일 HMAC 식별값)은 그대로 유지된다.
-- =============================================================

create or replace function public.release_withdrawn_social_identities(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- 탈퇴가 성립한 계정만 정리한다. 탈퇴 전 계정의 로그인 수단을 지우면 접근을 잃는다.
  if not exists (
    select 1 from public.profiles p
     where p.id = p_user_id
       and p.status = 'WITHDRAWN'::public.account_status
  ) then
    raise exception 'not_withdrawn' using errcode = 'P0002';
  end if;

  delete from auth.identities i
   where i.user_id = p_user_id
     and i.provider <> 'email';
  get diagnostics v_count = row_count;

  update auth.users u
     set raw_user_meta_data = '{}'::jsonb
   where u.id = p_user_id
     and u.raw_user_meta_data is distinct from '{}'::jsonb;

  return v_count;
end;
$$;

comment on function public.release_withdrawn_social_identities(uuid) is
  '탈퇴 회원의 소셜 로그인 연결과 제공자 프로필을 지운다(#293). 같은 소셜 계정으로 새로 가입할 수 있게 한다. 탈퇴 처리 서버 액션 전용.';

revoke all on function public.release_withdrawn_social_identities(uuid) from public, anon, authenticated;
grant execute on function public.release_withdrawn_social_identities(uuid) to service_role;

-- ---------- 이미 탈퇴한 계정 정리 (1회) ----------
delete from auth.identities i
 using public.profiles p
 where p.id = i.user_id
   and p.status = 'WITHDRAWN'::public.account_status
   and i.provider <> 'email';

update auth.users u
   set raw_user_meta_data = '{}'::jsonb
  from public.profiles p
 where p.id = u.id
   and p.status = 'WITHDRAWN'::public.account_status
   and u.raw_user_meta_data is distinct from '{}'::jsonb;

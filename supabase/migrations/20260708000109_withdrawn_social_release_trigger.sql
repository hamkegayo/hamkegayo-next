-- =============================================================
-- 탈퇴와 같은 트랜잭션에서 소셜 로그인 연결 해제 (#293, #295 리뷰)
--
--  무엇이 문제였나
--    마이그레이션 108 은 탈퇴 서버 액션이 계정을 잠근 뒤 별도 RPC 로 소셜 연결을
--    지우게 했다. 그 RPC 가 네트워크 오류 등으로 한 번 실패하면 회원은 이미
--    로그아웃·차단된 뒤라 다시 시도할 길이 없고, 같은 소셜 계정으로는 계속
--    "이용할 수 없는 계정입니다"가 떴다.
--
--  바꾼 방식
--    profiles.status 가 WITHDRAWN 으로 바뀌는 순간 트리거가 같은 트랜잭션에서
--    소셜 연결(provider <> 'email')을 지우고 제공자 프로필(raw_user_meta_data)을
--    비운다. 탈퇴(withdraw_member)가 커밋되면 해제도 함께 커밋되고, 탈퇴가
--    실패하면 함께 롤백된다. 서버 액션을 거치지 않는 탈퇴 경로(후속 운영자 탈퇴)도
--    같은 트리거를 탄다. 서버 액션의 별도 RPC 호출은 없앴다.
--
--  근거 (마이그레이션 108 과 같음)
--    개인정보처리방침 제4조 — 회원 식별 정보는 "분쟁 대응에 필요한 최소 정보만"
--      분리 보관(#72: 이름·연락처·이메일). 제공자 회원번호·프로필은 그 밖이다.
--    개인정보처리방침 제11조 ① — 처리 목적이 달성된 개인정보는 지체 없이 파기한다.
-- =============================================================

create or replace function public.trg_release_withdrawn_social_identities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.identities i
   where i.user_id = new.id
     and i.provider <> 'email';

  update auth.users u
     set raw_user_meta_data = '{}'::jsonb
   where u.id = new.id
     and u.raw_user_meta_data is distinct from '{}'::jsonb;

  return new;
end;
$$;

comment on function public.trg_release_withdrawn_social_identities() is
  '프로필이 WITHDRAWN 으로 바뀌면 같은 트랜잭션에서 소셜 로그인 연결과 제공자 프로필을 지운다(#293).';

revoke all on function public.trg_release_withdrawn_social_identities() from public, anon, authenticated;

drop trigger if exists trg_profiles_release_social_on_withdraw on public.profiles;
create trigger trg_profiles_release_social_on_withdraw
  after update of status on public.profiles
  for each row
  when (new.status = 'WITHDRAWN'::public.account_status
        and old.status is distinct from 'WITHDRAWN'::public.account_status)
  execute function public.trg_release_withdrawn_social_identities();

-- 108 적용 뒤 이 마이그레이션 전에 탈퇴했지만 서버 액션의 해제가 실패한 계정을 정리한다(재실행해도 무해).
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

-- =============================================================
-- 연락용 이메일 전역 중복 방지 — #64 리뷰 반영
--  - 일반 회원과 파트너를 포함한 profiles 전체에서 이메일을 하나의 계정만 사용한다.
--  - 입력 정규화 누락에도 안전하도록 대소문자를 구분하지 않는다.
--  - NULL(연락 이메일 미등록)은 여러 행에서 허용한다.
--
-- 개인정보처리방침 제13조 — 개인정보 접근통제 및 비인가 접근 방지
-- =============================================================

do $$
begin
  if exists (
    select lower(email)
      from public.profiles
     where email is not null
     group by lower(email)
    having count(*) > 1
  ) then
    raise exception 'profiles.email 중복 데이터를 먼저 정리해야 합니다.';
  end if;
end $$;

create unique index if not exists profiles_email_lower_unique_idx
  on public.profiles (lower(email))
  where email is not null;

comment on index public.profiles_email_lower_unique_idx is
  '일반 회원·파트너 연락용 이메일의 대소문자 무관 전역 UNIQUE 보장.';

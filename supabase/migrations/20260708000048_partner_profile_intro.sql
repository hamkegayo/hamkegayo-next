-- =============================================================
-- 파트너 기본정보 저장 — #64
--  - 자기소개는 partner_accounts 에 저장하고 DB에서도 300자를 강제한다.
--  - 파트너는 본인 자기소개만 수정할 수 있다.
--  - 연락용 이메일은 OTP 검증 서버 액션만 변경할 수 있도록 직접 UPDATE를 막는다.
--
-- 개인정보처리방침 제12조 ① — 정보주체의 개인정보 정정 권리
-- =============================================================

alter table public.partner_accounts
  add column if not exists intro text;

comment on column public.partner_accounts.intro is
  '파트너 프로필 자기소개. 최대 300자.';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'partner_accounts_intro_length_check'
       and conrelid = 'public.partner_accounts'::regclass
  ) then
    alter table public.partner_accounts
      add constraint partner_accounts_intro_length_check
      check (char_length(intro) <= 300);
  end if;
end $$;

drop policy if exists "partner_accounts_update_own_intro" on public.partner_accounts;
create policy "partner_accounts_update_own_intro"
  on public.partner_accounts for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- 테이블 단위 UPDATE가 있으면 login_id까지 바꿀 수 있으므로 회수 후 intro만 허용한다.
revoke update on public.partner_accounts from anon, authenticated;
grant update (intro) on public.partner_accounts to authenticated;

-- 이메일 변경은 최근 OTP 인증 여부를 service_role 서버 액션에서 검사한다.
revoke update (email) on public.profiles from authenticated;

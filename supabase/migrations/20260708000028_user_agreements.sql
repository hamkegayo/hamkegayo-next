-- =============================================================
-- 동의 이력 (#58)
--
--  회원가입에서 4종 동의를 필수로 받으면서 **아무 데도 저장하지 않고 있었다.**
--  동의 사실의 입증 책임은 회사에 있다(개인정보보호법). 분쟁이 생기면
--  "동의를 받았다" 를 증명할 수단이 없다.
--
--  버전을 함께 저장하는 이유
--    약관이 개정되면 기존 회원의 동의는 옛 버전에 대한 것이다. 재동의가
--    필요한지 판단하려면 "무엇에 동의했는지" 가 남아 있어야 한다.
--    버전 값은 문서의 시행일(ISO)을 쓴다 — lib/legal/agreements.ts.
--
--  이력이므로 행을 덮어쓰지 않고 쌓는다. 같은 버전에 두 번 동의하는 것은
--  의미가 없어 (user_id, agreement_type, version) 에 유니크를 건다.
-- =============================================================

create table if not exists public.user_agreements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  agreement_type text not null,
  version        text not null,
  agreed_at      timestamptz not null default now(),

  constraint user_agreements_type_check check (
    agreement_type in ('SERVICE', 'PRIVACY', 'PERSONAL', 'SENSITIVE')
  ),
  -- 같은 버전 재동의는 무의미하다. 서버는 on conflict do nothing 으로 넣는다.
  constraint user_agreements_unique unique (user_id, agreement_type, version)
);

comment on table public.user_agreements is
  '약관·개인정보 동의 이력. 개정 시 재동의 판별을 위해 버전을 함께 남긴다. 조회는 본인, 생성은 서버(admin).';
comment on column public.user_agreements.agreement_type is
  'SERVICE(이용약관) / PRIVACY(개인정보처리방침) / PERSONAL(일반 개인정보 수집·이용) / SENSITIVE(민감정보 수집·이용)';
comment on column public.user_agreements.version is
  '동의한 문서의 시행일(ISO, 예 2026-09-03). lib/legal 의 문서 버전과 같은 값.';

-- 최신 동의 버전을 찾는 것이 주 용도다.
create index if not exists idx_user_agreements_user
  on public.user_agreements (user_id, agreement_type, agreed_at desc);

-- ---------- RLS ----------
-- 본인 이력만 볼 수 있다. 생성·수정·삭제 정책은 두지 않는다 —
-- 동의 이력은 **사용자가 고칠 수 없어야** 증거로서 의미가 있다.
-- 서버(service_role)만 쓰기가 가능하다.
alter table public.user_agreements enable row level security;

drop policy if exists "user_agreements_select_own" on public.user_agreements;
create policy "user_agreements_select_own"
  on public.user_agreements for select
  using (auth.uid() = user_id);

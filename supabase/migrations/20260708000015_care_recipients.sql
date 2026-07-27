-- =============================================================
-- 보호 대상(환자) 정보 관리 — 마이페이지 '환자 정보 관리'
--  - 회원이 자주 이용하는 환자를 저장/재사용하기 위한 테이블.
--  - 본인(user_id)만 CRUD (RLS).
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create table if not exists public.care_recipients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  relation   text,
  gender     text check (gender in ('male', 'female')),
  birth      date,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.care_recipients is '회원의 보호 대상(환자) 정보. 본인만 CRUD.';

create index if not exists idx_care_recipients_user
  on public.care_recipients (user_id, created_at desc);

drop trigger if exists trg_care_recipients_updated_at on public.care_recipients;
create trigger trg_care_recipients_updated_at
  before update on public.care_recipients
  for each row execute function public.set_updated_at();

-- ---------- RLS: 본인만 ----------
alter table public.care_recipients enable row level security;

drop policy if exists "care_recipients_select_own" on public.care_recipients;
create policy "care_recipients_select_own"
  on public.care_recipients for select
  using (auth.uid() = user_id);

drop policy if exists "care_recipients_insert_own" on public.care_recipients;
create policy "care_recipients_insert_own"
  on public.care_recipients for insert
  with check (auth.uid() = user_id);

drop policy if exists "care_recipients_update_own" on public.care_recipients;
create policy "care_recipients_update_own"
  on public.care_recipients for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "care_recipients_delete_own" on public.care_recipients;
create policy "care_recipients_delete_own"
  on public.care_recipients for delete
  using (auth.uid() = user_id);

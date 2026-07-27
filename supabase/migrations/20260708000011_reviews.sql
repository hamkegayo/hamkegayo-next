-- =============================================================
-- 이용 후기(reviews) — #23
--  - 완료(COMPLETED)된 서비스 1건당 후기 1건 (service_id unique)
--  - 목록/상세는 전체 공개(anon 포함) → 작성자명은 마스킹해 행에 저장(author_masked)
--    (profiles RLS 우회 없이 공개 조회 가능)
--  - reply(운영팀 답변)는 컬럼만 두고 후속(관리자)에서 채움
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null unique references public.services (id) on delete cascade,
  customer_id   uuid not null references public.profiles (id) on delete cascade,
  partner_id    uuid not null references public.profiles (id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  title         text not null,
  content       text not null,
  author_masked text not null,          -- 마스킹된 작성자명 (예: 홍O동)
  reply         text,                    -- 운영팀 답변(후속)
  created_at    timestamptz not null default now()
);

comment on table public.reviews is '이용 후기. 완료 서비스 1건당 1건. 목록/상세 전체 공개.';

create index if not exists idx_reviews_created on public.reviews (created_at desc);

-- =============================================================
-- RLS — 조회는 전체 공개, 작성은 본인(고객)만
-- =============================================================
alter table public.reviews enable row level security;

drop policy if exists "reviews_select_public" on public.reviews;
create policy "reviews_select_public"
  on public.reviews for select
  to anon, authenticated
  using (true);

drop policy if exists "reviews_insert_owner" on public.reviews;
create policy "reviews_insert_owner"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = customer_id);

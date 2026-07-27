-- =============================================================
-- 파트너 자격/보유 사항 + 증빙 파일(Storage) — #22
--  - 파트너가 자격증 등을 업로드(비공개 버킷) → 관리자 심사 후 인증
--  - status: PENDING(인증 대기) → VERIFIED(인증 완료)
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'qualification_status') then
    create type public.qualification_status as enum ('PENDING', 'VERIFIED');
  end if;
end $$;

create table if not exists public.partner_qualifications (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.profiles (id) on delete cascade,
  type          text not null,   -- 자격 종류(제목)
  reg_no        text,            -- 등록번호
  acquired_date text,            -- 취득일(표시용 문자열)
  issuer        text,            -- 발급 기관
  path          text not null,   -- storage object 경로
  filename      text not null,
  size          bigint not null,
  status        public.qualification_status not null default 'PENDING',
  created_at    timestamptz not null default now()
);

comment on table public.partner_qualifications is
  '파트너 자격/보유 사항. 증빙 파일은 partner-qualifications 버킷.';

create index if not exists idx_partner_qualifications_partner
  on public.partner_qualifications (partner_id, created_at desc);

-- ---------- RLS: 파트너 본인 ----------
alter table public.partner_qualifications enable row level security;

drop policy if exists "partner_quals_select_own" on public.partner_qualifications;
create policy "partner_quals_select_own"
  on public.partner_qualifications for select
  using (auth.uid() = partner_id);

drop policy if exists "partner_quals_insert_own" on public.partner_qualifications;
create policy "partner_quals_insert_own"
  on public.partner_qualifications for insert
  with check (auth.uid() = partner_id);

drop policy if exists "partner_quals_delete_own" on public.partner_qualifications;
create policy "partner_quals_delete_own"
  on public.partner_qualifications for delete
  using (auth.uid() = partner_id);

-- =============================================================
-- Storage: 비공개 버킷 + objects RLS (경로 {partner_uid}/{uuid}_{name})
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-qualifications', 'partner-qualifications', false, 5242880,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "partner_qual_insert_own" on storage.objects;
create policy "partner_qual_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partner-qualifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "partner_qual_select_own" on storage.objects;
create policy "partner_qual_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'partner-qualifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "partner_qual_delete_own" on storage.objects;
create policy "partner_qual_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'partner-qualifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================
-- 보호자 리포트 + 첨부(Storage) — #22
--  - 완료(COMPLETED)된 서비스 1건당 리포트 1건 (service_id unique)
--  - 첨부는 비공개 버킷(report-attachments) + report_attachments 메타 테이블
--  - 파일 조회는 서버에서 signed URL 발급(클라 직접 접근 차단)
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- 열거형: 리포트 상태 ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('DRAFT', 'SUBMITTED');
  end if;
end $$;

-- ---------- reports 테이블 ----------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null unique references public.services (id) on delete cascade,
  partner_id    uuid not null references public.profiles (id) on delete cascade,
  status        public.report_status not null default 'DRAFT',
  meet_time     text,                       -- 만난 시간 (HH:mm)
  end_time      text,                       -- 종료 시간 (HH:mm)
  supports      text[] not null default '{}', -- 수행 지원 내용(+기타 직접입력)
  exam          text,                       -- 검사 진행 내용
  guardian_note text,                       -- 보호자 전달사항
  submitted_at  timestamptz,                -- 제출(생성) 시각
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.reports is '보호자 리포트. 완료된 서비스 1건당 1행.';

drop trigger if exists trg_reports_updated_at on public.reports;
create trigger trg_reports_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create index if not exists idx_reports_partner
  on public.reports (partner_id, created_at desc);

-- ---------- report_attachments 테이블 ----------
create table if not exists public.report_attachments (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  kind       text not null,                 -- 처방전 / 영수증 / 검사예약증 등
  path       text not null,                 -- storage object 경로
  filename   text not null,
  size       bigint not null,
  created_at timestamptz not null default now()
);

comment on table public.report_attachments is '리포트 첨부 파일 메타. 실파일은 report-attachments 버킷.';

create index if not exists idx_report_attachments_report
  on public.report_attachments (report_id);

-- =============================================================
-- RLS — 파트너 본인 리포트/첨부
-- =============================================================
alter table public.reports enable row level security;

drop policy if exists "reports_select_partner" on public.reports;
create policy "reports_select_partner"
  on public.reports for select using (auth.uid() = partner_id);

drop policy if exists "reports_insert_partner" on public.reports;
create policy "reports_insert_partner"
  on public.reports for insert with check (auth.uid() = partner_id);

drop policy if exists "reports_update_partner" on public.reports;
create policy "reports_update_partner"
  on public.reports for update
  using (auth.uid() = partner_id)
  with check (auth.uid() = partner_id);

alter table public.report_attachments enable row level security;

-- 첨부는 소유 리포트(파트너 본인) 기준으로 접근
drop policy if exists "report_attachments_all_partner" on public.report_attachments;
create policy "report_attachments_all_partner"
  on public.report_attachments for all
  using (
    exists (
      select 1 from public.reports r
       where r.id = report_id and r.partner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.reports r
       where r.id = report_id and r.partner_id = auth.uid()
    )
  );

-- =============================================================
-- Storage: 비공개 버킷 + objects RLS
--   경로 규칙: {partner_uid}/{service_id}/{uuid}_{filename}
--   → 첫 폴더가 본인 uid 인 객체만 업로드/조회/삭제 가능
--   (고객 열람은 서버 service_role signed URL 로 처리 → 정책 불필요)
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-attachments', 'report-attachments', false, 5242880,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "report_attach_insert_own" on storage.objects;
create policy "report_attach_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "report_attach_select_own" on storage.objects;
create policy "report_attach_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "report_attach_delete_own" on storage.objects;
create policy "report_attach_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

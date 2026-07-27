-- =============================================================
-- 알림(notifications) — #23
--  - 수신자(recipient) 대상 알림. 조회/읽음은 본인만.
--  - 생성(insert)은 서버 액션에서 service_role(admin)로 처리
--    (행위자≠수신자라 클라 RLS insert 는 열지 않음)
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type         text not null,   -- RESERVATION_CONFIRMED / SERVICE_COMPLETED / REPORT_READY / PARTNER_APPLIED ...
  title        text not null,
  body         text,
  link         text,            -- 클릭 시 이동 경로
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.notifications is '사용자 알림. 조회/읽음은 수신자 본인, 생성은 서버(admin).';

create index if not exists idx_notifications_recipient
  on public.notifications (recipient_id, created_at desc);

-- ---------- RLS: 수신자 본인만 조회/읽음 ----------
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = recipient_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

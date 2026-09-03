-- =============================================================
-- 포인트 원장 — #49
--
--  기획 확정 : 결제 금액의 1% 적립, 1P = 1원으로 사용.
--
--  ⚠️ 용어 불일치 — 화면·코드는 "포인트", 약관은 "서비스 이용 크레딧"이다.
--     어르신 이용자에게 "크레딧"이 직관적이지 않다는 판단으로 제품 용어를 포인트로 정했다.
--     약관 제16조 ⑨·제19조 ⑤⑥ 의 "크레딧" 표기를 "포인트"로 개정해야 한다.
--
--  ⚠️ 적립 근거 조항 없음 — 약관 제16조 ⑨·제19조 ⑤ 는 **회사·파트너 귀책에 대한 보상**만
--     규정한다. "모든 결제 1% 적립"은 적립형 제도라 현재 약관에 근거가 없다.
--     조항 신설 전까지 적립 로직을 켜지 않는다. (스키마만 선반영)
--     제19조 ⑥ : "크레딧의 지급기준, 금액, 사용방법 및 유효기간 등은 별도로 정하여 안내한다."
--
--  잔액은 행 합계로 구한다. 적립은 양수, 사용·만료는 음수.
--  실제 적립/차감은 결제 성공 서버 액션에서 수행한다(PG 연동 시).
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'point_reason') then
    create type public.point_reason as enum (
      'EARN_PAYMENT',   -- 결제 적립 (결제액의 1%)
      'COMPENSATION',   -- 보상 지급 (약관 제16조 ⑨ · 제19조 ⑤)
      'USE',            -- 결제 시 사용 (payments.discount_amount 와 짝)
      'USE_CANCEL',     -- 사용 취소(환불) 시 복원
      'EXPIRE'          -- 유효기간 만료 차감
    );
  end if;
end $$;

create table if not exists public.points (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  -- 적립 +, 사용·만료 − (1P = 1원)
  amount         integer not null check (amount <> 0),
  reason         public.point_reason not null,
  reservation_id uuid references public.reservations (id) on delete set null,
  payment_id     uuid references public.payments (id) on delete set null,
  -- 유효기간. null 이면 무기한 (기준 미정 — 약관 제19조 ⑥)
  expires_at     timestamptz,
  memo           text,
  created_at     timestamptz not null default now()
);

comment on table public.points is
  '포인트 원장. 잔액은 행 합계로 구한다. 1P = 1원.';
comment on column public.points.amount is
  '적립 양수 / 사용·만료 음수. 결제 적립은 결제액의 1%.';

create index if not exists idx_points_user
  on public.points (user_id, created_at desc);
create index if not exists idx_points_expiry
  on public.points (expires_at) where expires_at is not null;

-- ---------- 잔액 조회 ----------
create or replace function public.point_balance(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer
    from public.points
   where user_id = p_user_id
     and (expires_at is null or expires_at > now());
$$;

comment on function public.point_balance(uuid) is
  '유효한 포인트 잔액(원). 만료된 적립분은 제외한다.';

-- =============================================================
-- RLS — 본인 조회만. 적립·차감은 service_role 전용.
-- =============================================================
alter table public.points enable row level security;

drop policy if exists "points_select_own" on public.points;
create policy "points_select_own"
  on public.points for select
  using (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE 정책 없음 → 잔액 조작 불가

revoke all on function public.point_balance(uuid) from public, anon;
grant execute on function public.point_balance(uuid) to authenticated;

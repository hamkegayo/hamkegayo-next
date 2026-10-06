-- =============================================================
-- 결제 포인트 적립 — #249
--
--  사용자 결정 2026-10-07
--   - 서비스 이용 결제 금액의 1% 를 포인트로 적립한다. 1P = 1원.
--   - 유효기간 없음(expires_at = null).
--   - 약관 조항은 신설하지 않고 화면 안내로 공개한다
--     (약관 제19조 ④ "크레딧의 지급기준 … 별도로 정하여 안내한다").
--   → 마이그레이션 19 의 "조항 신설 전까지 적립 로직을 켜지 않는다" 는 이 결정으로 대체된다.
--
--  적립 시점 — 서비스 완료 후 최종 정산이 끝났을 때 1회.
--   결제 직후 적립하면 취소·부분환불 때 회수해야 하고, 이미 쓴 포인트는 회수할 수 없다.
--   "정산이 끝났다" =
--     · 예약 COMPLETED, 최종 요금(final_amount) 확정
--     · 서비스 COMPLETED, 노쇼 아님
--     · 결제 대기(PENDING) 없음 — 추가결제가 남아 있으면 기다린다
--     · 환불 요청 진행 중(PENDING/APPROVED) 없음 — 미달분 환불이 끝나야 한다
--   취소·노쇼·예외 종료 제공 불가(예약 CANCELLED)는 적립하지 않는다.
--
--  기준 금액 — PAID 결제의 현금 합계 Σ(gross_amount - discount_amount).
--   선결제 + 추가결제 - 환불(REFUND 행은 음수). discount_amount 에는 포인트 사용분과
--   이벤트 할인이 들어 있으므로 함께 빠진다. 1원 미만 버림, 0 이하면 적립하지 않는다.
--
--  소급 없음 — 정책 시작 시각(이 마이그레이션 적용 시각) 이후 종료된 서비스만 적립한다.
--
--  호출 — 서비스 완료 직후 앱이 바로 부르고(대부분의 건), 추가결제·환불이 남아 있던 건은
--   10분 주기 cron(point-earn-sweep)이 마무리한다. 같은 예약은 유니크 인덱스로 한 번만 쌓인다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- 정책 (단일 행) ----------
create table if not exists public.point_earn_policy (
  id         boolean primary key default true check (id),
  rate       numeric(5,4) not null check (rate > 0 and rate < 1),
  started_at timestamptz not null default now()
);

comment on table public.point_earn_policy is
  '결제 포인트 적립 정책(단일 행). started_at 이후 종료된 서비스만 적립한다 — 소급 없음.';

insert into public.point_earn_policy (id, rate)
values (true, 0.01)
on conflict (id) do nothing;

alter table public.point_earn_policy enable row level security;
-- 정책 없음 → 클라이언트에서 읽거나 바꿀 수 없다.
revoke all on public.point_earn_policy from public, anon, authenticated;

-- ---------- 예약당 1회 ----------
create unique index if not exists uq_points_earn_reservation
  on public.points (reservation_id)
  where reason = 'EARN_PAYMENT'::public.point_reason;

-- ---------- 적립 ----------
create or replace function public.earn_reservation_points(p_reservation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_status   public.reservation_status;
  v_final    integer;
  v_rate     numeric;
  v_start    timestamptz;
  v_cash     bigint;
  v_amount   integer;
  v_base     uuid;
  v_inserted uuid;
begin
  -- 같은 예약의 동시 호출(앱 직후 호출 + cron)을 직렬화한다.
  select customer_id, status, final_amount
    into v_customer, v_status, v_final
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found or v_customer is null
     or v_status <> 'COMPLETED'::public.reservation_status
     or v_final is null then
    return 0;
  end if;

  if exists (
    select 1 from public.points
     where reservation_id = p_reservation_id
       and reason = 'EARN_PAYMENT'::public.point_reason
  ) then
    return 0;
  end if;

  select rate, started_at into v_rate, v_start
    from public.point_earn_policy where id;
  if not found then return 0; end if;

  if not exists (
    select 1 from public.services s
     where s.reservation_id = p_reservation_id
       and s.status = 'COMPLETED'::public.service_status
       and not s.no_show
       and s.ended_at >= v_start
  ) then
    return 0;
  end if;

  -- 추가결제가 남아 있으면 정산이 끝나지 않은 것이다.
  if exists (
    select 1 from public.payments
     where reservation_id = p_reservation_id
       and status = 'PENDING'::public.payment_status
  ) then
    return 0;
  end if;

  -- 미달분 환불이 진행 중이면 기다린다.
  if exists (
    select 1 from public.refund_requests
     where reservation_id = p_reservation_id
       and status in ('PENDING'::public.refund_request_status,
                      'APPROVED'::public.refund_request_status)
  ) then
    return 0;
  end if;

  select coalesce(sum(gross_amount - discount_amount), 0)
    into v_cash
    from public.payments
   where reservation_id = p_reservation_id
     and status = 'PAID'::public.payment_status;

  v_amount := floor(v_cash * v_rate)::integer;
  if v_amount <= 0 then return 0; end if;

  select id into v_base
    from public.payments
   where reservation_id = p_reservation_id
     and type = 'BASE'::public.payment_type
     and status = 'PAID'::public.payment_status
   order by paid_at
   limit 1;

  insert into public.points (user_id, amount, reason, reservation_id, payment_id, memo)
  values (v_customer, v_amount, 'EARN_PAYMENT'::public.point_reason,
          p_reservation_id, v_base, '서비스 이용 결제 금액의 1% 적립')
  on conflict (reservation_id) where reason = 'EARN_PAYMENT'::public.point_reason
  do nothing
  returning id into v_inserted;

  if v_inserted is null then return 0; end if;

  insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
  values (
    v_customer, 'POINT_EARNED', '포인트가 적립되었어요',
    format('서비스 이용 결제 금액의 1%%인 %sP가 적립되었어요.',
           to_char(v_amount, 'FM999,999,999')),
    '/mypage/points',
    'point-earn:' || p_reservation_id::text
  )
  on conflict (recipient_id, dedupe_key) do nothing;

  return v_amount;
end;
$$;

comment on function public.earn_reservation_points(uuid) is
  '최종 정산이 끝난 예약에 결제 금액의 1% 포인트를 한 번 적립한다. 조건 미충족·이미 적립이면 0. 서버 전용.';

revoke all on function public.earn_reservation_points(uuid)
  from public, anon, authenticated;

-- ---------- 주기 정리 ----------
-- 추가결제·환불이 끝난 뒤 완료된 건을 마무리한다. 조건이 아직 안 맞는 건은 다음 주기에 다시 본다.
create or replace function public.sweep_earn_points()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  for v_id in
    select r.id
      from public.reservations r
      join public.services s on s.reservation_id = r.id
     where r.status = 'COMPLETED'::public.reservation_status
       and s.status = 'COMPLETED'::public.service_status
       and not s.no_show
       and s.ended_at >= (select started_at from public.point_earn_policy where id)
       and not exists (
         select 1 from public.points p
          where p.reservation_id = r.id
            and p.reason = 'EARN_PAYMENT'::public.point_reason
       )
     order by s.ended_at desc
     limit 500
  loop
    if public.earn_reservation_points(v_id) > 0 then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

comment on function public.sweep_earn_points() is
  '정산이 끝났지만 아직 적립되지 않은 예약에 포인트를 적립한다(최대 500건). 적립한 건수를 반환. cron 전용.';

revoke all on function public.sweep_earn_points()
  from public, anon, authenticated;

do $$
declare
  existing bigint;
begin
  for existing in
    select jobid from cron.job where jobname = 'point-earn-sweep'
  loop
    perform cron.unschedule(existing);
  end loop;
end;
$$;

select cron.schedule(
  'point-earn-sweep',
  '*/10 * * * *',
  $cron$select public.sweep_earn_points()$cron$
);

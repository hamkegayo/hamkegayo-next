-- =============================================================
-- 추가결제 미납 관리 (#75) — 약관 제22조
--
--  ⚠️ **리포트 잠금은 넣지 않는다.** 이슈는 "제22조 ③ 추가결제 완료 후
--     리포트 제공" 을 미수 회수의 핵심 장치로 들었지만, 현재 약관 제22조
--     ③ 은 "미납금이 전액 지급될 때까지 **신규 예약 또는 서비스 이용을
--     제한**할 수 있다" 이고 리포트 언급이 없다.
--     조문에 없는 제재는 넣지 않는다 — 약관 개정 후 도입한다(2026-09-05 리뷰).
--
--  미납 판정은 **기한 경과 후**다. 링크를 보낸 직후부터 막으면 결제할 시간을
--  주지 않고 제재하는 셈이 된다. 소프트 상한에 걸려 아직 보내지 않은 건은
--  우리가 안 보낸 것이므로 미납이 아니다.
-- =============================================================

alter table public.payments
  -- 마지막 독촉 시각. 하루 1회 배치가 이 값을 보고 대상을 고른다.
  add column if not exists reminded_at    timestamptz,
  add column if not exists reminder_count integer not null default 0;

comment on column public.payments.reminded_at is
  '추가결제 독촉을 마지막으로 보낸 시각. 하루 1회 배치가 중복 발송을 피하는 기준.';

-- 미납 조회가 잦아진다. 부분 인덱스로 대상만 훑는다.
create index if not exists idx_payments_unpaid
  on public.payments (reservation_id)
  where type = 'EXTENSION'::public.payment_type
    and status = 'PENDING'::public.payment_status;

-- =============================================================
-- ① 미납 여부 — 신규 예약 제한 판정 (약관 제22조 ③)
-- =============================================================
create or replace function public.has_unpaid_charge(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.payments p
      join public.reservations r on r.id = p.reservation_id
     where r.customer_id = p_user_id
       and p.type = 'EXTENSION'::public.payment_type
       and p.status = 'PENDING'::public.payment_status
       -- 보내지 않은 건은 미납이 아니다(소프트 상한 검토 대기).
       and p.link_sent_at is not null
       -- 기한 안에는 결제할 시간을 준다.
       and p.token_expires_at is not null
       and p.token_expires_at <= now()
  );
$$;

comment on function public.has_unpaid_charge(uuid) is
  '기한이 지난 추가결제 미납이 있는지. 약관 제22조 ③ 신규 예약 제한 판정용.';

revoke all on function public.has_unpaid_charge(uuid) from public, anon;
grant execute on function public.has_unpaid_charge(uuid) to authenticated;

-- =============================================================
-- ② 본인 미결제 목록 — 마이페이지
--
--  기한이 지나면 링크 토큰이 죽어 결제할 방법이 사라진다. 로그인한 본인은
--  여기서 다시 결제할 수 있어야 한다. 그러지 않으면 "내야 하는데 낼 수가
--  없는" 상태가 된다.
-- =============================================================
create or replace function public.list_my_unpaid_charges()
returns table (
  payment_id  uuid,
  amount      integer,
  code        text,
  use_date    date,
  charge_reason text,
  expires_at  timestamptz,
  overdue     boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         p.gross_amount,
         r.code,
         r.use_date,
         p.charge_reason,
         p.token_expires_at,
         (p.token_expires_at is not null and p.token_expires_at <= now())
    from public.payments p
    join public.reservations r on r.id = p.reservation_id
   where r.customer_id = auth.uid()
     and p.type = 'EXTENSION'::public.payment_type
     and p.status = 'PENDING'::public.payment_status
     and p.link_sent_at is not null
   order by p.created_at;
$$;

comment on function public.list_my_unpaid_charges() is
  '로그인 본인의 미결제 추가결제 목록. 기한이 지나 링크가 죽어도 여기서 다시 결제할 수 있다.';

revoke all on function public.list_my_unpaid_charges() from public, anon;
grant execute on function public.list_my_unpaid_charges() to authenticated;

-- =============================================================
-- ③ 결제 링크 재발급 — 본인만
--
--  기한이 지난 건에 새 토큰을 발급한다. 금액은 그대로다 — 재발급으로
--  금액이 바뀔 수 있으면 그 자체가 공격 표면이 된다.
-- =============================================================
create or replace function public.reissue_extension_token(
  p_payment_id uuid,
  p_token      text,
  p_expires    timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_status public.payment_status;
  v_type   public.payment_type;
begin
  select r.customer_id, p.status, p.type
    into v_owner, v_status, v_type
    from public.payments p
    join public.reservations r on r.id = p.reservation_id
   where p.id = p_payment_id
     for update of p;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_type <> 'EXTENSION'::public.payment_type
     or v_status <> 'PENDING'::public.payment_status then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.payments
     set pay_token = p_token,
         token_expires_at = p_expires
   where id = p_payment_id;

  return p_token;
end;
$$;

comment on function public.reissue_extension_token(uuid, text, timestamptz) is
  '본인의 미결제 추가결제에 새 링크 토큰을 발급한다. 금액은 바뀌지 않는다.';

revoke all on function public.reissue_extension_token(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.reissue_extension_token(uuid, text, timestamptz)
  to authenticated;

-- =============================================================
-- ④ 독촉 대상 — 하루 1회 배치가 가져간다
--
--  발송 자체는 앱이 한다(메일). DB 에서 메일을 보낼 수 없으므로 대상만
--  고르고 reminded_at 을 함께 갱신해 같은 건이 하루에 두 번 나가지 않게 한다.
-- =============================================================
create or replace function public.claim_extension_reminders(p_limit integer default 100)
returns table (
  payment_id  uuid,
  customer_id uuid,
  amount      integer,
  code        text,
  use_date    date,
  pay_token   text,
  overdue     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with target as (
    select p.id
      from public.payments p
     where p.type = 'EXTENSION'::public.payment_type
       and p.status = 'PENDING'::public.payment_status
       and p.link_sent_at is not null
       -- 발송 당일에는 다시 보내지 않는다.
       and p.link_sent_at < now() - interval '20 hours'
       and (p.reminded_at is null or p.reminded_at < now() - interval '20 hours')
     order by p.created_at
     limit greatest(1, p_limit)
  ), claimed as (
    update public.payments p
       set reminded_at = now(),
           reminder_count = p.reminder_count + 1
      from target t
     where p.id = t.id
    returning p.id, p.reservation_id, p.gross_amount, p.pay_token,
              p.token_expires_at
  )
  select c.id,
         r.customer_id,
         c.gross_amount,
         r.code,
         r.use_date,
         c.pay_token,
         (c.token_expires_at is not null and c.token_expires_at <= now())
    from claimed c
    join public.reservations r on r.id = c.reservation_id;
end;
$$;

comment on function public.claim_extension_reminders(integer) is
  '독촉 대상을 가져가면서 reminded_at 을 갱신한다. 같은 건이 하루에 두 번 나가지 않는다. 서버 전용.';

revoke all on function public.claim_extension_reminders(integer)
  from public, anon, authenticated;

-- =============================================================
-- ⑤ 관리자 미수 목록
-- =============================================================
create or replace function public.admin_list_unpaid_charges()
returns table (
  payment_id  uuid,
  amount      integer,
  code        text,
  use_date    date,
  charge_reason text,
  link_sent_at timestamptz,
  expires_at  timestamptz,
  reminder_count integer,
  review_required boolean,
  overdue     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select p.id, p.gross_amount, r.code, r.use_date, p.charge_reason,
         p.link_sent_at, p.token_expires_at, p.reminder_count,
         p.review_required,
         (p.token_expires_at is not null and p.token_expires_at <= now())
    from public.payments p
    join public.reservations r on r.id = p.reservation_id
   where p.type = 'EXTENSION'::public.payment_type
     and p.status = 'PENDING'::public.payment_status
   order by p.created_at;
end;
$$;

comment on function public.admin_list_unpaid_charges() is
  '미결제 추가결제 목록(관리자). 소프트 상한 검토 대기 건도 함께 보인다 — 링크를 아직 보내지 않은 건이다.';

revoke all on function public.admin_list_unpaid_charges() from public, anon;
grant execute on function public.admin_list_unpaid_charges() to authenticated;
